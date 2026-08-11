import { readFileSync, readdirSync, statSync, lstatSync, readlinkSync, writeFileSync, renameSync, existsSync, realpathSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';

export const VAULT = join(process.env.HOME, 'Obsidian', 'brain');
export const TASK_DIR = join(VAULT, 'bin', 'state', 'tasks');
export const INBOX_DIR = join(VAULT, 'bin', 'state', 'inbox');
export const ARCHIVE_DIR = join(VAULT, 'archive');

const scalar = (raw) => {
  const v = raw.trim();
  if (v.startsWith('"')) { try { return JSON.parse(v); } catch { /* fall through */ } }
  return v.replace(/^['"]|['"]$/g, '');
};

// Tolerant of both `type: x` at top level and the nested `metadata:\n  type: x` form.
export function parseFrontmatter(text) {
  if (!text.startsWith('---\n')) return {};
  const end = text.indexOf('\n---', 4);
  if (end === -1) return {};
  const fm = {};
  for (const line of text.slice(4, end).split('\n')) {
    const m = line.match(/^(\s*)([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!m) continue;
    const [, indent, key, value] = m;
    if (indent.length > 0 && !value.trim()) continue;
    if (value.trim()) fm[key] = scalar(value);
  }
  return fm;
}

// Vault'taki iş alanları. Her biri altında bir veya daha çok "leaf" memory klasörü var;
// her leaf, harness'ın bir proje dizinine symlink'li ve KENDİ MEMORY.md'sini taşır
// (harness yalnızca o klasörde çalışırken onu yükler).
//
// İSİMLER VE KÖKLER MAKİNEYE ÖZGÜ, bu yüzden kodda değil `bin/state/config.json` içinde
// duruyorlar: scriptlerin kendisi public bir dotfiles deposunda taşınıyor, işveren/proje
// adları oraya giremez. Dosya yoksa hiçbir şey çökmez ama HİÇBİR cwd eşleşmez — hook'lar
// sessizce hiçbir iş yapmaz. Yeni makinede ilk iş bu dosyayı doldurmaktır (bin/docs/README.md).
export const CONFIG_PATH = join(VAULT, 'bin', 'state', 'config.json');

const CONFIG = (() => {
  try { return JSON.parse(readFileSync(CONFIG_PATH, 'utf8')); } catch { return {}; }
})();

const expandHome = (p) => (p.startsWith('~/') ? join(process.env.HOME, p.slice(2)) : p);
const CONFIG_WS = Array.isArray(CONFIG.workspaces) ? CONFIG.workspaces : [];

export const WORKSPACES = CONFIG_WS.map((w) => w?.name).filter(Boolean);

// cwd -> iş alanı. Görev panosu bu isme göre seçilir (bin/state/tasks/<ws>.md).
// Kök tanımlanmamış iş alanları (ör. yalnız arşiv amaçlı olanlar) hiçbir cwd'ye düşmez.
export const WS_ROOTS = CONFIG_WS
  .filter((w) => w?.name && w?.root)
  .map((w) => [expandHome(w.root), w.name]);

export const workspaceForCwd = (cwd = '') =>
  WS_ROOTS.find(([root]) => cwd === root || cwd.startsWith(`${root}/`))?.[1] || null;

export function listLeafDirs() {
  const leaves = [];
  for (const ws of WORKSPACES) {
    const wsDir = join(VAULT, ws);
    let entries;
    try { entries = readdirSync(wsDir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const dir = join(wsDir, e.name);
      if (readdirSync(dir).some((f) => f.endsWith('.md') && f !== 'MEMORY.md')) {
        leaves.push({ dir, ws, label: e.name });
      }
    }
  }
  return leaves;
}

export function loadNotes(dir) {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md') && f !== 'MEMORY.md')
    .map((file) => {
      const path = join(dir, file);
      const text = readFileSync(path, 'utf8');
      const fm = parseFrontmatter(text);
      return {
        file,
        path,
        text,
        mtime: statSync(path).mtimeMs,
        name: fm.index_title || fm.name || file.replace(/\.md$/, ''),
        description: fm.description || '',
        hook: fm.index_hook || fm.description || '',
        type: fm.type || 'project',
        status: fm.status || 'active',
      };
    });
}

// Hook stdin'i okur. TIMEOUT ŞART: harness pipe'ı kapatmazsa `for await` sonsuza kadar
// bloklar ve her oturum açılışı asılır — global bir hook için mümkün olan en kötü hata.
export function readHookInput(ms = 300) {
  return new Promise((resolve) => {
    let data = '';
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      process.stdin.destroy();
      try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); }
    };
    const timer = setTimeout(finish, ms);
    timer.unref?.();
    process.stdin.on('data', (c) => { data += c; });
    process.stdin.on('end', finish);
    process.stdin.on('error', finish);
  });
}

// --- repo varlık denetimi ---------------------------------------------------
// Harness dizin adı, gerçek yoldaki alfanümerik olmayan HER karakteri '-' yapar
// ('/', '_', '.' hepsi '-' olur) — ada bakıp yol tahmin edilemez. Bu yüzden her
// seviyede diskteki gerçek klasör adları aynı şekilde normalize edilip eşleştirilir.
const norm = (s) => s.replace(/[^A-Za-z0-9]/g, '-');

export function resolveRealPath(harnessName) {
  const walk = (dir, rest) => {
    if (!rest || rest === '-') return dir;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return null; }
    for (const e of entries) {
      if (!e.isDirectory() && !e.isSymbolicLink()) continue;
      const n = norm(e.name);
      if (rest === `-${n}`) return join(dir, e.name);
      if (rest.startsWith(`-${n}-`)) {
        const r = walk(join(dir, e.name), rest.slice(n.length + 1));
        if (r) return r;
      }
    }
    return null;
  };
  return walk('/', harnessName);
}

export const PROJECTS_DIR = join(process.env.HOME, '.claude', 'projects');

// Vault'a symlink'li her harness memory klasörünü, gerçek repo yolu ve canlılığıyla döner.
export function auditLeaves() {
  const rows = [];
  for (const name of readdirSync(PROJECTS_DIR).sort()) {
    const memPath = join(PROJECTS_DIR, name, 'memory');
    let st;
    try { st = lstatSync(memPath); } catch { continue; }
    const vaultDir = st.isSymbolicLink() ? readlinkSync(memPath) : memPath;
    if (!vaultDir.startsWith(VAULT)) continue;
    let notes = [];
    try { notes = readdirSync(vaultDir).filter((f) => f.endsWith('.md') && f !== 'MEMORY.md'); } catch { /* kırık link */ }
    const realPath = resolveRealPath(name);
    rows.push({
      leaf: vaultDir.replace(`${VAULT}/`, ''),
      harnessDir: join(PROJECTS_DIR, name),
      memPath,
      vaultDir,
      realPath,
      exists: Boolean(realPath),
      notes: notes.length,
    });
  }
  return rows;
}

export function contextForCwd(cwd) {
  const ws = workspaceForCwd(cwd);
  if (!ws) return null;

  const match = auditLeaves()
    .filter((row) => row.realPath && row.leaf.startsWith(`${ws}/`) &&
      (cwd === row.realPath || cwd.startsWith(`${row.realPath}/`)))
    .sort((a, b) => b.realPath.length - a.realPath.length)[0];
  const leaf = match ? match.leaf.slice(ws.length + 1) : '_kok';

  return {
    ws,
    leaf,
    leafDir: join(VAULT, ws, leaf),
    taskFile: join(TASK_DIR, `${ws}.md`),
  };
}

export const TYPE_ORDER = ['user', 'feedback', 'project', 'reference'];

export function byType(notes) {
  const groups = new Map(TYPE_ORDER.map((t) => [t, []]));
  for (const n of notes) {
    if (!groups.has(n.type)) groups.set(n.type, []);
    groups.get(n.type).push(n);
  }
  for (const list of groups.values()) list.sort((a, b) => a.name.localeCompare(b.name));
  return groups;
}

// --- indeks üretimi ---------------------------------------------------------
// TEK KAYNAK. reindex.mjs (CLI), brief.mjs (SessionStart), capture.mjs (SessionEnd) ve
// reindex-hook.mjs (PostToolUse) hepsi buradan geçer; böylece "elle reindex çalıştırmayı
// unutmak" diye bir hata sınıfı kalmaz.
export const INDEX_LABEL = {
  user: 'Kim / tercihler',
  feedback: 'Çalışma şekli (feedback)',
  project: 'Projeler & kararlar',
  reference: 'Referanslar',
};

const INDEX_HEADER = [
  '<!-- GENERATED by ~/Obsidian/brain/bin/scripts/reindex.mjs — elle düzenleme.',
  '     Bir satırı değiştirmek için notun frontmatter\'ındaki `index_title:` / `index_hook:` alanını düzenle. -->',
  '',
];

// Bir leaf klasörün MEMORY.md içeriğini frontmatter'dan üretir. Diske dokunmaz.
export function buildIndex(dir) {
  const notes = loadNotes(dir).filter((n) => n.status !== 'archived');
  if (!notes.length) return null;
  const lines = [...INDEX_HEADER];
  for (const [type, list] of byType(notes)) {
    if (!list.length) continue;
    lines.push(`## ${INDEX_LABEL[type] || type}`, '');
    for (const n of list) lines.push(`- [${n.name}](${n.file}) — ${n.hook}`);
    lines.push('');
  }
  return { text: lines.join('\n'), notes };
}

// Yarım yazılmış MEMORY.md diye bir şey olmasın: aynı anda iki oturum yazarsa bile
// okuyan taraf ya eski ya yeni dosyanın TAMAMINI görür.
function atomicWrite(path, text) {
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}

// Diskteki indeksleri notlarla eşitler.
//   check: true  → hiçbir şey yazmaz, sadece bayat olanları döner (doğrulama için)
//   only: [dir]  → sadece bu leaf klasörleri
// Dönen: { stale, changed, added } — added = indekse YENİ giren satırlar (leaf bazında).
export function syncIndexes({ only = null, check = false } = {}) {
  const stale = [];
  const added = [];
  for (const leaf of listLeafDirs()) {
    if (only && !only.includes(leaf.dir)) continue;
    let built;
    try { built = buildIndex(leaf.dir); } catch { continue; }
    if (!built) continue;
    const idx = join(leaf.dir, 'MEMORY.md');
    const current = existsSync(idx) ? readFileSync(idx, 'utf8') : null;
    if (current === built.text) continue;

    const oldLines = new Set((current || '').split('\n').filter((l) => l.startsWith('- [')));
    for (const l of built.text.split('\n')) {
      if (l.startsWith('- [') && !oldLines.has(l)) added.push({ ws: leaf.ws, label: leaf.label, line: l });
    }
    stale.push(`${leaf.ws}/${leaf.label}`);
    if (!check) atomicWrite(idx, built.text);
  }
  return { stale, added };
}

// --- redaksiyon ------------------------------------------------------------
// TEK KAYNAK. Hem prompt hem komut metni buradan geçer. Komutlar dosya yollarından
// çok daha sık secret taşıyor (`--secret-string`, `--password`, satır içi TOKEN=...),
// ve inbox bulut senkronlu bir vault'a yazıyor — redaksiyon opsiyonel değil.
export const redactSecrets = (text) => String(text)
  .replace(/\b(?:sk|ghp|github_pat|xox[baprs])[-_][A-Za-z0-9_-]{8,}\b/gi, '[REDACTED]')
  .replace(/\b(AKIA[0-9A-Z]{12,})\b/g, '[REDACTED]')
  .replace(/\b((?:api[_-]?key|token|password|secret)\s*[:=]\s*)\S+/gi, '$1[REDACTED]')
  .replace(/(--(?:secret-string|password|token|api-key|secret)(?:=|\s+))(?!\[REDACTED\])\S+/gi, '$1[REDACTED]');

// --- ops komut tespiti ------------------------------------------------------
// NEDEN ALLOWLIST: bir oturumda onlarca okuma komutu (ls/grep/dig/aws describe-*) geçiyor.
// "Okuma olmayan her şey" kuralı hem `ops` alanının 200 karakterlik bütçesini hem brief'in
// 8.000 karakterini patlatır ve asıl mutasyonu kırpmanın dışında bırakır. Bu yüzden yalnız
// DURUMU DEĞİŞTİREN komut aileleri sayılıyor; okuma fiilleri ayrıca açıkça eleniyor.
const AWS_READ = /^(?:describe|list|get|ls|wait|help|search|scan|query|select|lookup|head|test|validate|estimate|check|filter|presign|preview|generate-presigned)/;
const AWS_WRITE = /^(?:create|delete|put|update|modify|change|attach|detach|start|stop|reboot|terminate|enable|disable|register|deregister|associate|disassociate|publish|send|invoke|import|export|restore|reset|rotate|revoke|grant|tag|untag|set|add|remove|apply|deploy|run|copy|move|sync|upload|purchase|request|cancel|accept|reject|activate|deactivate|promote|switch|replace|resume|suspend|cp|mv|rm|mb|rb)(?:[-_]|$)/;

const SUBCOMMAND_RULES = {
  kubectl: /^(?:apply|delete|create|patch|scale|rollout|drain|cordon|uncordon|label|annotate|replace|edit|set|taint|expose|autoscale)$/,
  terraform: /^(?:apply|destroy|import|taint|untaint|state)$/,
  helm: /^(?:install|upgrade|uninstall|rollback|delete)$/,
  eksctl: /^(?:create|delete|upgrade|scale|drain)$/,
  docker: /^push$/,
  // `commit` bilerek YOK: her dev oturumunda birden çok kez geçip `ops`'un 200 karakterini
  // yiyor ve asıl ilginç olanı (docker push, kubectl rollout) kırpmanın dışına itiyor —
  // üstelik o oturumlarda `touched` zaten hikâyeyi anlatıyor. Dışarı çıkan iş `push`.
  git: /^(?:push|tag|merge)$/,
  npm: /^publish$/,
  yarn: /^publish$/,
  pnpm: /^publish$/,
};

// `gh` iki kelimelik: `gh pr create` sayılır, `gh pr list` sayılmaz.
const GH_RULES = /^(?:pr (?:create|merge|close|ready)|release (?:create|delete|upload)|issue create|repo (?:create|delete))$/;

// Heredoc GÖVDESİ komut değil, veridir. `cat > x <<EOF ... EOF` ile bir test fixture'ı ya da
// script yazarken içerideki satırlar aynen ayrıştırılırsa "çalıştırılmış" gibi görünür —
// bu, gerçek bir oturumda ölçülmüş bir false positive kaynağı.
const stripHeredocBodies = (command) => {
  const kept = [];
  let terminator = null;
  for (const line of String(command).split('\n')) {
    if (terminator !== null) {
      if (line.trim() === terminator) terminator = null;
      continue;
    }
    kept.push(line);
    const opener = line.match(/<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/);
    if (opener) terminator = opener[2];
  }
  return kept.join('\n');
};

// Komut dizisini segmentlere böler: `&&`, `||`, `;`, `|`, `&` ve satır sonu.
// TIRNAK DUYARLI olmak ZORUNDA: `node -e "... && git push ..."` gibi bir çağrıda içerideki
// metin argümandır, çalıştırılan komut değil; naif split onu ayrı bir komutmuş gibi gösterir.
const segments = (command) => {
  const text = stripHeredocBodies(command);
  const parts = [];
  let current = '';
  let quote = null;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '\\' && i + 1 < text.length) { current += ch + text[i + 1]; i += 1; continue; }
    if (quote) {
      if (ch === quote) quote = null;
      current += ch;
      continue;
    }
    if (ch === '"' || ch === '\'') { quote = ch; current += ch; continue; }
    if (ch === '\n' || ch === ';') { parts.push(current); current = ''; continue; }
    if (ch === '|' || ch === '&') {
      // `2>&1`, `&>log` gibi yönlendirmelerdeki `&` ayırıcı DEĞİL; ayrılırsa komut
      // etiketi `git push origin X 2>` diye kesik kalır (gerçek oturumda ölçüldü).
      if (ch === '&' && text[i + 1] !== '&' && (text[i - 1] === '>' || text[i + 1] === '>')) {
        current += ch;
        continue;
      }
      if (text[i + 1] === ch) i += 1; // `&&` / `||`
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts;
};

// Segmentin başındaki gürültüyü at: `sudo`, `command`, ve `VAR=deger` ön ekleri.
const bareTokens = (segment) => {
  const tokens = segment.trim().split(/\s+/).filter(Boolean);
  while (tokens.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0]) || /^(?:sudo|command|env|time|nohup)$/.test(tokens[0]))) {
    tokens.shift();
  }
  return tokens;
};

const isOpsSegment = (tokens) => {
  if (!tokens.length) return false;
  const tool = basename(tokens[0]);
  const rest = tokens.slice(1).filter((t) => !t.startsWith('-'));

  if (tool === 'aws') {
    const operation = rest[1] || ''; // aws <servis> <islem>
    if (!operation || AWS_READ.test(operation)) return false;
    return AWS_WRITE.test(operation);
  }
  if (tool === 'gh') return GH_RULES.test(rest.slice(0, 2).join(' '));
  if (tool === 'terraform' && rest[0] === 'state') return /^(?:mv|rm|push)$/.test(rest[1] || '');

  const rule = SUBCOMMAND_RULES[tool];
  return Boolean(rule && rule.test(rest[0] || ''));
};

// Bir shell komut metninden kayda değer ops segmentlerini döner (redakte, tekilleştirilmiş).
// Çıkış koduna BAKILMAZ: tool_use bloğunda exit status yok, tool_result ile eşleştirmenin
// maliyeti değmiyor — başarısız bir mutasyon denemesi de bilinmeye değer.
export function opsFromCommand(command) {
  const found = [];
  for (const segment of segments(command)) {
    if (!isOpsSegment(bareTokens(segment))) continue;
    const clean = redactSecrets(segment).replace(/\s+/g, ' ').trim();
    if (clean && !found.includes(clean)) found.push(clean);
  }
  return found;
}

// Bir dosya yolu vault'taki hangi leaf klasöre ait? (harness symlink'i üzerinden gelse bile)
// Dönen: { dir, isIndex } | null
export function leafForFile(filePath) {
  if (!filePath || !filePath.endsWith('.md')) return null;
  let real;
  try { real = realpathSync(dirname(filePath)); } catch { return null; }
  // Dönen dir MUTLAKA listLeafDirs()'ün ürettiği biçim olmalı — syncIndexes'in `only`
  // filtresi string eşitliğiyle çalışıyor. Vault bir gün symlink arkasına taşınırsa
  // (iCloud/Dropbox) realpath biçimi farklı olur; iki tarafı da çözüp eşleştiriyoruz,
  // yoksa `only` hiçbir şeyle eşleşmez ve hook sessizce hiçbir iş yapmaz.
  const leaf = listLeafDirs().find((l) => {
    if (l.dir === real) return true;
    try { return realpathSync(l.dir) === real; } catch { return false; }
  });
  if (!leaf) return null;
  return { dir: leaf.dir, isIndex: basename(filePath) === 'MEMORY.md' };
}
