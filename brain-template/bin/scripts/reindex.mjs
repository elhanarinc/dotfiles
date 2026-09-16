// Vault'taki HER memory klasörü için MEMORY.md'yi frontmatter'dan yeniden üretir.
// Her klasörün kendi MEMORY.md'si var çünkü harness onu yalnızca o proje dizininde
// çalışırken context'e yüklüyor — yani bu dosya o projenin context bütçesi.
// `status: archived` olan notlar indekse girmez.
//
// Artık ELLE çalıştırmak zorunda değilsin: PostToolUse (yazma anında), SessionStart ve
// SessionEnd hook'ları aynı kodu çağırıyor. Bu CLI teşhis ve tek seferlik onarım için.
//
// Kullanım:
//   node reindex.mjs                  → hepsini eşitle
//   node reindex.mjs personal appsm   → sadece bu iş alanları
//   node reindex.mjs --check          → hiçbir şey yazma, bayat indeks varsa exit 1
import { join } from 'node:path';
import { buildIndex, listLeafDirs, loadNotes, syncIndexes, VAULT } from './lib.mjs';

const argv = process.argv.slice(2);
const checkOnly = argv.includes('--check');
const only = argv.filter((a) => !a.startsWith('--'));

const leaves = listLeafDirs().filter((l) => !only.length || only.includes(l.ws) || only.includes(`${l.ws}/${l.label}`));
const dirs = leaves.map((l) => l.dir);

const { stale, added } = syncIndexes({ only: dirs, check: checkOnly });

let totalNotes = 0, totalBytes = 0;
const warnings = [];
for (const leaf of leaves) {
  const built = buildIndex(leaf.dir);
  if (!built) continue;
  const bytes = Buffer.byteLength(built.text);
  totalNotes += built.notes.length;
  totalBytes += bytes;
  const noHook = built.notes.filter((n) => !n.hook);
  if (noHook.length) warnings.push(`${leaf.ws}/${leaf.label}: index_hook yok → ${noHook.map((n) => n.file).join(', ')}`);
  const mark = stale.includes(`${leaf.ws}/${leaf.label}`) ? (checkOnly ? ' BAYAT' : ' güncellendi') : '';
  console.log(`${`${leaf.ws}/${leaf.label}`.padEnd(38)} ${String(built.notes.length).padStart(3)} not  ${String(bytes).padStart(6)} bayt${mark}`);
}

console.log(`\n${leaves.length} klasör · ${totalNotes} aktif not · ${totalBytes} bayt toplam indeks`);
console.log(`vault: ${VAULT}`);
for (const a of added) console.log(`+ ${a.ws}/${a.label}: ${a.line}`);
for (const w of warnings) console.log(`⚠ ${w}`);

if (checkOnly && stale.length) {
  console.log(`\n✗ ${stale.length} klasörün indeksi bayat: ${stale.join(', ')}`);
  process.exit(1);
}
