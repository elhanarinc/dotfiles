// Codex SessionStart hook. Codex kendi MEMORY.md yüklemesini yapmadığı için aktif
// leaf indeksini de burada verir; çıktı hook sınırının altında kalmak zorundadır.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import {
  VAULT,
  INBOX_DIR,
  auditLeaves,
  contextForCwd,
  loadNotes,
  parseFrontmatter,
  readHookInput,
  syncIndexes,
} from './lib.mjs';

const LIMIT = 8000;

const newestInbox = (ws) => {
  const dir = join(INBOX_DIR, ws);
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter((file) => file.endsWith('.md'))
    .map((file) => ({ file, path: join(dir, file), mtime: statSync(join(dir, file)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (!files.length) return null;
  const newest = files[0];
  return { ...newest, metadata: parseFrontmatter(readFileSync(newest.path, 'utf8')) };
};

const openTasks = (taskFile) => {
  if (!existsSync(taskFile)) return [];
  return readFileSync(taskFile, 'utf8')
    .split('\n')
    .filter((line) => /^\s*-\s*\[ \]/.test(line))
    .map((line) => line.trim());
};

const metadataLines = (inbox) => {
  if (!inbox) return [];
  const fields = ['date', 'project', 'topic', 'touched', 'notes', 'status'];
  const details = fields
    .filter((key) => inbox.metadata[key])
    .map((key) => `${key}: ${inbox.metadata[key]}`);
  return [
    `### En yeni inbox metadatası — \`brain/bin/state/inbox/${basename(join(inbox.path, '..'))}/${inbox.file}\``,
    ...details.map((line) => `- ${line}`),
  ];
};

const siblingCatalog = (ctx) => {
  const active = `${ctx.ws}/${ctx.leaf}`;
  const siblings = auditLeaves()
    .filter((row) => row.leaf.startsWith(`${ctx.ws}/`) && row.leaf !== active)
    .map((row) => {
      let notes = row.notes;
      try { notes = loadNotes(row.vaultDir).filter((note) => note.status !== 'archived').length; } catch { /* audit count remains useful */ }
      return `${row.leaf.slice(ctx.ws.length + 1)}(${notes})`;
    })
    .sort((a, b) => a.localeCompare(b));
  return siblings;
};

const TRUNCATION = '\n… (8.000 sınırında)';
const clamp = (text) => text.length <= LIMIT ? text : `${text.slice(0, LIMIT - TRUNCATION.length)}${TRUNCATION}`;

const main = async () => {
  const input = await readHookInput();
  const ctx = contextForCwd(input.cwd || process.cwd());
  if (!ctx) return;

  // Kapsam dışı cwd bu satıra hiç ulaşmaz: hiçbir indeks/klasör değiştirilmez.
  syncIndexes();
  const indexFile = join(ctx.leafDir, 'MEMORY.md');
  const index = existsSync(indexFile) ? readFileSync(indexFile, 'utf8') : '';
  const tasks = openTasks(ctx.taskFile);
  const inbox = newestInbox(ctx.ws);
  const siblings = siblingCatalog(ctx);
  const activePath = `brain/${ctx.ws}/${ctx.leaf}/MEMORY.md`;

  const out = [
    `## Codex brain brief — \`${activePath}\``,
    '',
    `### Açık görevler — \`brain/bin/state/tasks/${ctx.ws}.md\``,
    ...(tasks.length ? tasks : ['- Açık görev yok.']),
    '',
    ...metadataLines(inbox),
    ...(inbox ? [''] : []),
    `### ${ctx.ws} kardeş leaf kataloğu — otomatik yüklenmez`,
    ...(siblings.length ? [siblings.join(', ')] : ['- Kardeş leaf yok.']),
    '',
    `### Aktif generated index — \`${activePath}\``,
    index || '_Aktif indeks bulunamadı._',
  ];
  process.stdout.write(clamp(out.join('\n')));
};

main().catch(() => {}).finally(() => process.exit(0));
