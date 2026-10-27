// opencode-reindex-hook.mjs — OpenCode tool execute.after köprüsü.
// write/edit (input.path) ve shell (input.command) çağrılarında vault'taki Markdown
// değişikliklerini bulup indeksleri senkronlar. Vault dışı yazımlarda hiçbir şey yapmaz.
// CLI: stdin {"cwd","tool","args"} → stdout {}.
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  VAULT,
  applyBacklinks,
  backlinkPlan,
  leafForFile,
  noteWritesFromCommand,
  readHookInput,
  repairLinkFiles,
  resolveNotePath,
  syncIndexes,
} from './lib.mjs';

// args = OpenCode araç girdisi: write {path,content} · edit {path,oldString,newString} · shell {command}.
// Dönen: vault içindeki mutlak .md yolları (MEMORY.md dahil; filtre çağıranda).
export function writtenPaths(args, cwd) {
  const out = [];
  const add = (p) => { if (p && !out.includes(p)) out.push(p); };
  if (!args || typeof args !== 'object') return out;
  if (typeof args.path === 'string') {
    const p = resolveNotePath(args.path, cwd);
    add(p);
  }
  if (typeof args.command === 'string') {
    for (const raw of noteWritesFromCommand(args.command)) add(resolveNotePath(raw, cwd, args.command));
  }
  return out;
}

const main = async () => {
  const input = await readHookInput();
  const cwd = typeof input?.cwd === 'string' ? input.cwd : process.cwd();
  const dirs = new Set();
  const written = [];
  for (const path of writtenPaths(input?.args, cwd)) {
    const leaf = leafForFile(path);
    if (leaf && !leaf.isIndex) {
      dirs.add(leaf.dir);
      written.push([leaf.dir, basename(path)]);
    }
  }
  if (dirs.size) {
    for (const dir of dirs) syncIndexes({ only: [dir] });
    repairLinkFiles(written.map(([dir, file]) => join(dir, file)));
    const plan = [...dirs].flatMap((dir) =>
      backlinkPlan([{ dir }], written.filter(([d]) => d === dir).map(([, file]) => file)));
    applyBacklinks(plan, { log: join(VAULT, 'bin', 'state', 'backlink-auto.log'), append: true });
  }
  process.stdout.write('{}');
};

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) main().catch(() => process.stdout.write('{}')).finally(() => process.exit(0));
