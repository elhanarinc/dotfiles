// opencode-capture.mjs — OpenCode için idempotent catch-up capture.
// V2'de session-end olayı yok: her yeni oturum başında, önceki ve >=10 dk sessiz kalmış
// üst-düzey oturumlar inbox'a yazılır. codex-capture ile aynı not biçimi/redaksiyon.
// Oturum kaynağı enjekte edilebilir: `store` ya bir dizin (içinde `<id>.json` export'ları),
// ya da { list(): id[], get(id): export } nesnesi; verilmezse opencode CLI kullanılır.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INBOX_DIR, VAULT, contextForCwd, opsFromCommand, redactSecrets, syncIndexes } from './lib.mjs';
import { renderInboxNote } from './codex-capture.mjs';

export const STATE_PATH = join(VAULT, 'bin', 'state', 'opencode-captured.json');
const QUIET_MS = 10 * 60 * 1000;
const MIN_PROMPTS = 1;
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000; // ilk çalıştırmada eski birikim inbox'ı doldurmasın
const MAX_PER_RUN = 10;
const OPENCODE = process.env.OPENCODE_BIN || 'opencode';

export const cliStore = (n = 30) => ({
  list: () => JSON.parse(execFileSync(OPENCODE, ['session', 'list', '--format', 'json', '-n', String(n)],
    { encoding: 'utf8', timeout: 8000 })).map((s) => s.id),
  get: (id) => JSON.parse(execFileSync(OPENCODE, ['session', 'export', id],
    { encoding: 'utf8', timeout: 8000, maxBuffer: 64 * 1024 * 1024 })),
});

const dirStore = (dir) => ({
  list: () => readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => basename(f, '.json')),
  get: (id) => JSON.parse(readFileSync(join(dir, `${id}.json`), 'utf8')),
});

const loadState = (path) => {
  try { const s = JSON.parse(readFileSync(path, 'utf8')); return { done: s.done || {} }; } catch { return { done: {} }; }
};

const atomicWrite = (path, body) => {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  try { writeFileSync(tmp, body); renameSync(tmp, path); }
  finally { if (existsSync(tmp)) try { unlinkSync(tmp); } catch { /* fail open */ } }
};

const clean = (text) => redactSecrets(text).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
const oneLine = (v, max) => { const t = clean(v).replace(/\s+/g, ' '); return t.length > max ? `${t.slice(0, max)}…` : t; };

const slugify = (value) => oneLine(value, 100).toLocaleLowerCase('tr-TR')
  .normalize('NFKD').replace(/[ıİ]/g, 'i').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/g, '') || 'oturum';

const lastActivity = (doc) => Math.max(
  doc.info?.time?.updated || 0, doc.info?.time?.idle || 0,
  ...(doc.messages || []).map((m) => m.time?.completed || m.time?.created || 0),
);

export function scanSession(doc, cwd) {
  const scan = { prompts: [], files: [], notes: [], ops: [] };
  const seenFiles = new Set(); const seenNotes = new Set(); const seenOps = new Set();
  for (const msg of doc.messages || []) {
    if (msg.type === 'user') {
      const prompt = clean(msg.text || '');
      if (prompt) scan.prompts.push(prompt.length > 300 ? `${prompt.slice(0, 300)}…` : prompt);
      continue;
    }
    if (msg.type !== 'assistant') continue;
    for (const part of msg.content || []) {
      if (part?.type !== 'tool') continue;
      const input = part.state?.input || {};
      if (part.name === 'shell' && typeof input.command === 'string') {
        for (const op of opsFromCommand(input.command)) if (!seenOps.has(op)) { seenOps.add(op); scan.ops.push(clean(op)); }
      }
      if ((part.name === 'write' || part.name === 'edit') && typeof input.path === 'string') {
        const abs = isAbsolute(input.path) ? input.path : resolve(cwd || '.', input.path);
        if (abs.startsWith(`${VAULT}/`) && abs.endsWith('.md')) {
          const note = basename(abs, '.md');
          if (note !== 'MEMORY' && !seenNotes.has(note)) { seenNotes.add(note); scan.notes.push(note); }
          continue;
        }
        const rel = relative(resolve(cwd || '.'), abs);
        if (!rel || rel.startsWith('..') || isAbsolute(rel)) continue;
        if (!seenFiles.has(rel)) { seenFiles.add(rel); scan.files.push(rel); }
      }
    }
  }
  return scan;
}

export function captureSince({ store, statePath = STATE_PATH, now = Date.now(), inboxDir = INBOX_DIR, quietMs = QUIET_MS, reindex = true, maxAgeMs = MAX_AGE_MS, maxPerRun = MAX_PER_RUN } = {}) {
  const result = { captured: [], skipped: [] };
  const src = typeof store === 'string' ? dirStore(store) : (store || cliStore());
  const state = loadState(statePath);
  let ids;
  try { ids = src.list(); } catch { return result; }
  let dirty = false;
  for (const id of ids) {
    if (state.done[id]) continue;
    let doc;
    try { doc = src.get(id); } catch { continue; }
    const info = doc?.info || {};
    const mark = (status) => { state.done[id] = status; dirty = true; };
    if (info.parentID) { mark('child'); result.skipped.push(id); continue; }
    const cwd = info.location?.directory || '';
    const context = contextForCwd(cwd);
    if (!context) { mark('out-of-scope'); result.skipped.push(id); continue; }
    const last = lastActivity(doc);
    if (!last || now - last < quietMs) { result.skipped.push(id); continue; } // aktif: sonra tekrar bakılır
    if (now - last > maxAgeMs) { mark('stale'); result.skipped.push(id); continue; }
    if (result.captured.length >= maxPerRun) { result.skipped.push(id); continue; } // sonraki çalıştırmada
    const scan = scanSession(doc, cwd);
    if (scan.prompts.length < MIN_PROMPTS) { mark('too-short'); result.skipped.push(id); continue; }
    const endedAt = new Date(last);
    const day = endedAt.toISOString().slice(0, 10);
    const dir = join(inboxDir, context.ws);
    mkdirSync(dir, { recursive: true });
    const token = String(id).replace(/[^A-Za-z0-9_-]/g, '-');
    const target = join(dir, `${day}-${slugify(scan.prompts[0])}-${token}.md`);
    atomicWrite(target, renderInboxNote({ sessionId: id, cwd, rolloutPath: `opencode session export ${id}`, scan, endedAt }));
    mark('captured');
    result.captured.push(id);
  }
  if (dirty) atomicWrite(statePath, `${JSON.stringify(state, null, 2)}\n`);
  if (reindex && result.captured.length) { try { syncIndexes(); } catch { /* fail open */ } }
  return result;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  try { captureSince({}); } catch { /* fail open */ }
  process.exit(0);
}
