// Vault'taki her memory klasörünü gerçek repo yoluna çözer ve diskte var mı diye bakar.
//   node bin/scripts/audit.mjs            → rapor
//   node bin/scripts/audit.mjs --json     → makine okunur
import { auditLeaves } from './lib.mjs';

const rows = auditLeaves();
const HOME = process.env.HOME;

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  const alive = rows.filter((r) => r.exists);
  const dead = rows.filter((r) => !r.exists);
  console.log(`=== DİSKTE VAR (${alive.length} klasör, ${alive.reduce((a, r) => a + r.notes, 0)} not) ===`);
  for (const r of alive) console.log(`  ${r.leaf.padEnd(38)} ${String(r.notes).padStart(3)} not   ${r.realPath.replace(HOME, '~')}`);
  console.log(`\n=== DİSKTE YOK (${dead.length} klasör, ${dead.reduce((a, r) => a + r.notes, 0)} not) ===`);
  for (const r of dead) console.log(`  ${r.leaf.padEnd(38)} ${String(r.notes).padStart(3)} not   ← repo bulunamadı`);
  if (!dead.length) console.log('  (yok)');
  console.log('\nBudamak için: node bin/scripts/prune.mjs [--keep <leaf>] --apply');
}
