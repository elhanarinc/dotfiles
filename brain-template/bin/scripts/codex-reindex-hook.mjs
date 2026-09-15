// Codex PostToolUse hook. Direct file_path, patch metadata ve outer exec içindeki
// nested apply_patch yollarını çözer; yalnız vault'taki non-index Markdown notlarını eşitler.
import { basename, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyBacklinks, backlinkPlan, contextForCwd, leafForFile, noteWritesFromCommand, readHookInput, repairLinkFiles, syncIndexes, VAULT } from './lib.mjs';

const strings = (value, out = []) => {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const item of value) strings(item, out);
  else if (value && typeof value === 'object') for (const item of Object.values(value)) strings(item, out);
  return out;
};

const keyedPaths = (value, out = []) => {
  if (Array.isArray(value)) for (const item of value) keyedPaths(item, out);
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (/^(?:file_?path|path)$/i.test(key) && typeof item === 'string') out.push(item);
      else keyedPaths(item, out);
    }
  }
  return out;
};

const ABSOLUTE_MARKDOWN = /\/(?:[^/\s"'`()\[\]{}]+\/)*[^/\s"'`()\[\]{}]+\.md\b/g;
const PATCH_FILE = /^\*\*\* (?:Add|Update|Delete) File:\s*(.+\.md)\s*$/gm;

const candidatesFromInput = (input) => {
  const found = new Set(keyedPaths(input?.tool_input));
  for (const raw of strings(input?.tool_input)) {
    const text = raw.replace(/\\r\\n|\\n|\\r/g, '\n');

    // Codex exec'i kabuktan geçer: `cat > not.md <<EOF`, `tee`, `sed -i` yazımları
    // apply_patch işareti TAŞIMAZ ve 2026-09-11'e kadar buradan sessizce düşüyordu —
    // Claude tarafındaki `Write|Edit` matcher deliğinin Codex'teki karşılığı.
    // Tespit gene lib.mjs'te tek yerde.
    for (const target of noteWritesFromCommand(text)) found.add(target);

    if (!/apply_patch|\*\*\* (?:Add|Update|Delete) File:/.test(text)) continue;
    for (const match of text.matchAll(PATCH_FILE)) found.add(match[1].trim());
    for (const match of text.matchAll(ABSOLUTE_MARKDOWN)) found.add(match[0]);
  }
  return [...found];
};

const normalizePath = (candidate, cwd) => {
  const clean = String(candidate || '').trim().replace(/^['"`]|['"`]$/g, '');
  if (!clean) return null;
  if (clean.startsWith('~/')) return join(process.env.HOME, clean.slice(2));
  if (isAbsolute(clean)) return clean;
  // İKİ TABAN: bildirilen cwd VE vault kökü. `cd <vault> && cat > <göreli>.md` biçiminde
  // hook'a gelen cwd komutun içindeki cd'yi yansıtmaz; tek tabanla yol sessizce çözülmez.
  for (const base of [cwd, VAULT].filter(Boolean)) {
    const cand = resolve(base, clean);
    if (leafForFile(cand)) return cand;
  }
  return resolve(cwd || process.cwd(), clean);
};

const main = async () => {
  const input = await readHookInput();
  const context = contextForCwd(typeof input?.cwd === 'string' ? input.cwd : '');
  if (!context) return;

  const dirs = new Set();
  const written = [];
  for (const candidate of candidatesFromInput(input)) {
    const path = normalizePath(candidate, input?.cwd);
    const leaf = leafForFile(path);
    if (leaf && !leaf.isIndex) { dirs.add(leaf.dir); written.push([leaf.dir, basename(path)]); }
  }
  for (const dir of dirs) syncIndexes({ only: [dir] });

  // Claude tarafındaki reindex-hook ile aynı sözleşme: ölü linki ONAR, eksik geri linki YAZ.
  // İki hook ayrışırsa Codex'te yazılan notlar denetimsiz kalır — bir denetimde bildirim
  // katmanı ikisinde de çalışırken 27 ölü link + 37 notluk borç birikmişti, o yüzden burada
  // da bildirim değil düzeltme var. Sınır aynı: yalnız tek adaylı mekanik eşleşme.
  const repaired = repairLinkFiles(written.map(([dir, file]) => join(dir, file)));
  if (repaired.length) {
    process.stdout.write(`brain: ${repaired.length} ölü link dosya adına göre onarıldı (otomatik).\n`);
  }

  const plan = [...dirs].flatMap((dir) =>
    backlinkPlan([{ dir }], written.filter(([d]) => d === dir).map(([, file]) => file)));
  const done = applyBacklinks(plan, { log: join(VAULT, 'bin', 'state', 'backlink-auto.log'), append: true });
  if (done.size) {
    const names = [...done.values()].map((d) => d.target.replace(/\.md$/, ''));
    process.stdout.write(`brain: ${done.size} nota geri link yazıldı (otomatik): ${names.slice(0, 5).join(', ')}\n`);
  }
};

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) main().catch(() => {}).finally(() => process.exit(0));
