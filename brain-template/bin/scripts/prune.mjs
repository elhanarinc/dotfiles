// Diskte artık bulunmayan repoların memory klasörlerini aktif hafızadan çıkarır.
// SİLMEZ — archive/_kaldirilan-repolar/<leaf> altına taşır (geri alınabilir), symlink'i
// ve boşalan harness proje dizinini kaldırır. Böylece o repo bir daha context'e girmez.
//
//   node bin/scripts/prune.mjs                          → plan
//   node bin/scripts/prune.mjs --keep personal/finance-vault --apply
//
// Kalıcı olarak silmek için sonrasında: rm -rf archive/_kaldirilan-repolar/<leaf>
import { renameSync, unlinkSync, mkdirSync, existsSync, readdirSync, rmdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { auditLeaves, ARCHIVE_DIR, VAULT, WORKSPACES } from './lib.mjs';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const keep = args.reduce((acc, a, i) => (args[i - 1] === '--keep' ? [...acc, a] : acc), []);

const DEST_ROOT = join(ARCHIVE_DIR, '_kaldirilan-repolar');
const dead = auditLeaves().filter((r) => !r.exists && !keep.includes(r.leaf));
const kept = auditLeaves().filter((r) => !r.exists && keep.includes(r.leaf));

for (const r of dead) console.log(`  kaldır: ${r.leaf.padEnd(34)} ${String(r.notes).padStart(3)} not`);
for (const r of kept) console.log(`  TUTULUYOR (--keep): ${r.leaf.padEnd(24)} ${String(r.notes).padStart(3)} not`);
console.log(`\n${dead.length} klasör / ${dead.reduce((a, r) => a + r.notes, 0)} not → ${DEST_ROOT.replace(VAULT, 'brain')}`);

if (!APPLY) { console.log('(plan modu — uygulamak için --apply)'); process.exit(0); }

console.log('\n--- uygulanıyor ---');
for (const r of dead) {
  const dest = join(DEST_ROOT, r.leaf);
  if (existsSync(dest)) { console.error(`✗ hedef zaten var: ${r.leaf}`); continue; }
  mkdirSync(dirname(dest), { recursive: true });
  renameSync(r.vaultDir, dest);
  try { unlinkSync(r.memPath); } catch { /* symlink yoksa sorun değil */ }
  try { if (!readdirSync(r.harnessDir).length) rmdirSync(r.harnessDir); } catch { /* dolu */ }
  console.log(`✓ ${r.leaf} → archive/_kaldirilan-repolar/${r.leaf}`);
}
// boşalan iş alanı klasörlerini temizle
for (const ws of WORKSPACES) {
  try { if (!readdirSync(join(VAULT, ws)).length) rmdirSync(join(VAULT, ws)); } catch { /* dolu ya da yok */ }
}
