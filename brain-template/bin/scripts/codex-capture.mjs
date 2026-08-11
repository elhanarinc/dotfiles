// Codex SessionEnd hook. Rollout'tan yalnız kullanıcı promptlarını ve güvenli dosya
// yollarını çıkarır; asistan metni, araç çıktısı ve transcript gövdesi inbox'a girmez.
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INBOX_DIR, VAULT, contextForCwd, readHookInput, syncIndexes, redactSecrets, opsFromCommand } from './lib.mjs';

const MIN_PROMPTS = 2;
const MAX_META_BYTES = 64 * 1024;
const MAX_OPS = 12;

const isFile = (path) => {
  try { return statSync(path).isFile(); } catch { return false; }
};

const metadataFromRollout = (path) => {
  let fd;
  try {
    fd = openSync(path, 'r');
    const buffer = Buffer.alloc(MAX_META_BYTES);
    const length = readSync(fd, buffer, 0, buffer.length, 0);
    for (const line of buffer.subarray(0, length).toString('utf8').split('\n')) {
      if (!line.trim()) continue;
      let event;
      try { event = JSON.parse(line); } catch { continue; }
      if (event.type !== 'session_meta') continue;
      return {
        sessionId: event.payload?.session_id || event.payload?.id || null,
        cwd: event.payload?.cwd || null,
      };
    }
  } catch { /* okunamayan rollout eşleşmez */ } finally {
    if (fd !== undefined) try { closeSync(fd); } catch { /* zaten kapalı */ }
  }
  return null;
};

const sessionIdFromMetadata = (path) => metadataFromRollout(path)?.sessionId || null;

export function findCodexRollout(sessionId, codexHome = join(process.env.HOME, '.codex')) {
  if (!sessionId) return null;
  const root = join(codexHome, 'sessions');
  const files = [];
  const descend = (dir, depth) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => b.name.localeCompare(a.name)); }
    catch { return; }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (depth > 0 && entry.isDirectory()) descend(path, depth - 1);
      else if (depth === 0 && entry.isFile() && entry.name.endsWith('.jsonl')) files.push(path);
    }
  };
  descend(root, 3);
  return files.find((path) => basename(path).includes(sessionId))
    || files.find((path) => sessionIdFromMetadata(path) === sessionId)
    || null;
}

const allStrings = (value, out = []) => {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const item of value) allStrings(item, out);
  else if (value && typeof value === 'object') for (const item of Object.values(value)) allStrings(item, out);
  return out;
};

const ABSOLUTE_PATH = /\/(?:[^/\s"'`()\[\]{}]+\/)*[^/\s"'`()\[\]{}]+\.[A-Za-z0-9_-]{1,16}/g;
const PATCH_FILE = /^\*\*\* (?:Add|Update|Delete) File:\s*(.+?)\s*$/gm;

const candidatePaths = (input) => {
  const paths = new Set();
  if (input && typeof input === 'object') {
    for (const [key, value] of Object.entries(input)) {
      if (/^(?:file_?path|path)$/i.test(key) && typeof value === 'string') paths.add(value);
    }
  }
  for (const text of allStrings(input)) {
    for (const match of text.matchAll(PATCH_FILE)) paths.add(match[1].trim());
    for (const match of text.matchAll(ABSOLUTE_PATH)) paths.add(match[0]);
  }
  return [...paths];
};

// Codex'in shell aracı. `hooks.json` matcher'ı `(^|__)exec$` — gerçek ad `exec` ya da
// `container__exec`; tek bir literal ada güvenilmez, kalıba bakılır.
const SHELL_TOOL = /^(?:exec|shell|local_shell|bash)$|__exec$/i;

// DİKKAT: `function_call.arguments` bir NESNE DEĞİL, JSON *string*'i. Ham hâlde regex'e
// verilirse heredoc'lu çok satırlı komutlarda `\\n` kaçışları yüzünden sessizce yanlış
// eşleşir. Önce parse et, olmazsa ham metne düş.
const parseToolInput = (raw) => {
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return null;
  try { return JSON.parse(raw); } catch { return raw; }
};

// Çalıştırılan komutu çıkarır. Codex exec çağrısı `["bash","-lc","<komut>"]` biçiminde
// gelir; dizi olduğu gibi birleştirilirse tool adı `bash` olur ve allowlist ıskalar.
const commandText = (raw) => {
  const value = parseToolInput(raw);
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  const command = value.command ?? value.cmd ?? value.input;
  if (typeof command === 'string') return command;
  if (!Array.isArray(command)) return '';
  const last = command[command.length - 1];
  const isShellWrapper = command.length > 1
    && /^(?:bash|sh|zsh|dash)$/.test(basename(String(command[0] || '')))
    && typeof last === 'string';
  return isShellWrapper ? last : command.filter((part) => typeof part === 'string').join(' ');
};

const safePrompt = (text) => redactSecrets(text)
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .trim();

const isInjectedWorkspaceContext = (content) => {
  if (!Array.isArray(content)) return false;
  const texts = content
    .filter((part) => part?.type === 'input_text')
    .map((part) => String(part.text || '').trim());
  return texts.some((text) => text.startsWith('# AGENTS.md instructions') && text.includes('<INSTRUCTIONS>'))
    && texts.some((text) => text.startsWith('<environment_context>'));
};

export function scanCodexRollout(path, cwd) {
  const scan = { prompts: [], files: [], notes: [], ops: [] };
  if (!path || !isFile(path)) return scan;
  const seenFiles = new Set();
  const seenNotes = new Set();
  const seenOps = new Set();

  let body;
  try { body = readFileSync(path, 'utf8'); } catch { return scan; }
  for (const line of body.split('\n')) {
    if (!line.trim()) continue;
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    if (event.type !== 'response_item') continue;
    const item = event.payload || {};

    if (item.type === 'message' && item.role === 'user') {
      // Codex, AGENTS.md + environment_context enjeksiyonunu gerçek kullanıcı mesajıyla
      // aynı role altında rollout'a yazıyor. Claude'daki `isMeta` eşdeğeri olmadığı için
      // yapısal çift imzayı tanıyıp tüm sentetik mesajı atla.
      if (isInjectedWorkspaceContext(item.content)) continue;
      const text = Array.isArray(item.content)
        ? item.content.filter((part) => part?.type === 'input_text').map((part) => part.text || '').join(' ')
        : typeof item.content === 'string' ? item.content : '';
      const prompt = safePrompt(text);
      if (prompt && !/^<[^>]+>/.test(prompt)) {
        scan.prompts.push(prompt.length > 300 ? `${prompt.slice(0, 300)}…` : prompt);
      }
      continue;
    }

    if (!['custom_tool_call', 'function_call'].includes(item.type)) continue;
    const rawInput = item.input ?? item.arguments;
    const toolName = String(item.name || '');

    // Dosyaya dokunmayan ops işleri (DNS, IAM, deploy) yalnız burada görünür.
    if (SHELL_TOOL.test(toolName)) {
      for (const op of opsFromCommand(commandText(rawInput))) {
        if (seenOps.has(op)) continue;
        seenOps.add(op);
        scan.ops.push(op);
      }
    }

    const strings = allStrings(rawInput);
    const isWrite = /apply_patch|write|edit/i.test(toolName)
      || strings.some((text) => /apply_patch|\*\*\* (?:Add|Update) File:/.test(text));
    if (!isWrite) continue;

    for (let candidate of candidatePaths(rawInput)) {
      candidate = candidate.trim();
      if (!isAbsolute(candidate)) candidate = resolve(cwd || process.cwd(), candidate);
      if (candidate.startsWith(`${VAULT}/`) && candidate.endsWith('.md')) {
        const note = basename(candidate, '.md');
        if (note !== 'MEMORY' && !seenNotes.has(note)) {
          seenNotes.add(note);
          scan.notes.push(note);
        }
        continue;
      }
      if (!cwd) continue;
      const touched = relative(resolve(cwd), candidate);
      if (!touched || touched === '..' || touched.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(touched)) continue;
      if (!seenFiles.has(touched)) {
        seenFiles.add(touched);
        scan.files.push(touched);
      }
    }
  }
  return scan;
}

const oneLine = (value, max) => {
  const text = safePrompt(value).replace(/\s+/g, ' ');
  return text.length > max ? `${text.slice(0, max)}…` : text;
};

const quoted = (value, max = 1000) => JSON.stringify(oneLine(value, max));

const readableTitle = (prompt) => oneLine(prompt, 100)
  .replace(/^#+\s*/, '')
  .replace(/^[\s:;,.!?—–-]+/, '')
  || 'İsimsiz oturum';

const slugify = (value) => readableTitle(value)
  .toLocaleLowerCase('tr-TR')
  .normalize('NFKD')
  .replace(/[ıİ]/g, 'i')
  .replace(/[ğĞ]/g, 'g')
  .replace(/[üÜ]/g, 'u')
  .replace(/[şŞ]/g, 's')
  .replace(/[öÖ]/g, 'o')
  .replace(/[çÇ]/g, 'c')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 60)
  .replace(/-+$/g, '')
  || 'oturum';

export function renderInboxNote({ sessionId, cwd, rolloutPath, scan, endedAt }) {
  const ended = endedAt instanceof Date ? endedAt : new Date(endedAt);
  const safeEnded = Number.isNaN(ended.getTime()) ? new Date(0) : ended;
  const iso = safeEnded.toISOString();
  const day = iso.slice(0, 10);
  const prompts = Array.isArray(scan?.prompts) ? scan.prompts : [];
  const files = Array.isArray(scan?.files) ? scan.files : [];
  const notes = Array.isArray(scan?.notes) ? scan.notes : [];
  const ops = Array.isArray(scan?.ops) ? scan.ops : [];
  const title = readableTitle(prompts[0] || '');
  return [
    '---',
    `date: ${day}`,
    `project: ${quoted(basename(cwd || ''), 150)}`,
    `ended: ${iso}`,
    `title: ${quoted(title, 100)}`,
    `topic: ${quoted(prompts[0] || '', 150)}`,
    `touched: ${quoted(files.slice(0, 6).join(', '), 200)}`,
    `ops: ${quoted(ops.slice(0, 6).join(', '), 200)}`,
    `notes: ${quoted(notes.join(', '), 150)}`,
    `status: unprocessed`,
    `session_id: ${quoted(sessionId || '', 200)}`,
    `rollout: ${quoted(rolloutPath || '', 1000)}`,
    '---',
    `# ${title}`,
    '',
    `Bitiş: ${iso} · ${prompts.length} prompt`,
    '',
    '## Ne konuşuldu (kullanıcı promptları)',
    ...prompts.map((prompt) => `- ${oneLine(prompt, 300)}`),
    '',
    ...(files.length ? ['## Dokunulan dosyalar', ...files.map((file) => `- \`${oneLine(file, 300)}\``), ''] : []),
    ...(ops.length ? [
      '## Çalıştırılan ops komutları',
      ...ops.slice(0, MAX_OPS).map((op) => `- \`${oneLine(op, 300)}\``),
      ...(ops.length > MAX_OPS ? [`- …+${ops.length - MAX_OPS} komut daha`] : []),
      '',
    ] : []),
    ...(notes.length ? ['## Yazılan brain notları', ...notes.map((note) => `- [[${oneLine(note, 150)}]]`), ''] : []),
    '## Küratörlük',
    '- [ ] Kalıcı bir şey varsa doğru leaf notuna işle; sonra bu inbox kaydını kaldır.',
    '',
    `Rollout referansı: \`${oneLine(rolloutPath || '—', 1000)}\``,
    '',
  ].join('\n');
}

const atomicWrite = (path, body) => {
  const temporary = `${path}.tmp-${process.pid}`;
  try {
    writeFileSync(temporary, body);
    renameSync(temporary, path);
  } finally {
    if (existsSync(temporary)) try { unlinkSync(temporary); } catch { /* fail open */ }
  }
};

const sessionToken = (sessionId) => String(sessionId || 'nosid')
  .replace(/[^A-Za-z0-9_-]/g, '-')
  || 'nosid';

const rolloutMatchesHook = (path, sessionId, cwd) => {
  if (!path || !sessionId || !cwd || !isFile(path)) return false;
  const metadata = metadataFromRollout(path);
  if (!metadata || metadata.sessionId !== sessionId || typeof metadata.cwd !== 'string') return false;
  try { return resolve(metadata.cwd) === resolve(cwd); } catch { return false; }
};

const main = async () => {
  const input = await readHookInput();
  const cwd = typeof input.cwd === 'string' ? input.cwd : '';
  const context = contextForCwd(cwd);
  if (!context) return;

  const sessionId = typeof input.session_id === 'string' ? input.session_id : '';
  const explicit = typeof input.transcript_path === 'string' ? input.transcript_path : null;
  const candidate = rolloutMatchesHook(explicit, sessionId, cwd) ? explicit : findCodexRollout(sessionId);
  const rolloutPath = rolloutMatchesHook(candidate, sessionId, cwd) ? candidate : null;
  const scan = scanCodexRollout(rolloutPath, cwd);

  // Claude SessionEnd ile aynı güvenlik ağı; scope kontrolünden sonra çalışır.
  try { syncIndexes(); } catch { /* capture fail open kalır */ }
  if (scan.prompts.length < MIN_PROMPTS) return;

  const endedAt = new Date();
  const day = endedAt.toISOString().slice(0, 10);
  const inboxDir = join(INBOX_DIR, context.ws);
  mkdirSync(inboxDir, { recursive: true });
  const token = sessionToken(sessionId);
  const suffix = `-${token}.md`;
  const target = join(inboxDir, `${day}-${slugify(scan.prompts[0])}${suffix}`);
  // Resume/yeniden SessionEnd aynı session için başlığı güncellerken ikinci not bırakmasın.
  for (const file of readdirSync(inboxDir)) {
    if (file.endsWith(suffix) && join(inboxDir, file) !== target) {
      try { unlinkSync(join(inboxDir, file)); } catch { /* atomik yazma yine devam etsin */ }
    }
  }
  atomicWrite(target, renderInboxNote({ sessionId, cwd, rolloutPath, scan, endedAt }));
};

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) main().catch(() => {}).finally(() => process.exit(0));
