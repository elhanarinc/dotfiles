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
