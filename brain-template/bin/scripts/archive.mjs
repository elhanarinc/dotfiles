// Notu aktif hafızadan düşürür: `status: archived` damgalar ve archive/<ws>/<klasör>/ altına taşır.
// Silmez — Obsidian araması ve wikilink'ler çalışmaya devam eder, sadece MEMORY.md'ye girmez.
//
// Kullanım (vault'a göre yol, ya da mutlak yol):
//   node bin/scripts/archive.mjs personal/_kok/portfolio_30day_pause.md
//   node bin/scripts/archive.mjs <is-alani>/_kok/eski_not.md <is-alani>/<repo>/baska.md
// İndeksi kendisi eşitler — elle reindex GEREKMEZ. (PostToolUse hook'u yalnızca Write/Edit
// aracını yakalar; bu script node'dan çalıştığı için indeksleme sorumluluğu burada.)
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { join, isAbsolute, relative, dirname, basename } from 'node:path';
import { VAULT, ARCHIVE_DIR, WORKSPACES, syncIndexes } from './lib.mjs';

const args = process.argv.slice(2);
if (!args.length) {
  console.error('usage: node bin/scripts/archive.mjs <ws>/<klasör>/<dosya.md> [...]');
  console.error('örnek: node bin/scripts/archive.mjs personal/_kok/portfolio_30day_pause.md');
  process.exit(1);
}

let ok = 0;
for (const arg of args) {
  const src = isAbsolute(arg) ? arg : join(VAULT, arg);
  const rel = relative(VAULT, src);

  if (rel.startsWith('..')) { console.error(`✗ vault dışı: ${arg}`); continue; }
  if (!existsSync(src)) { console.error(`✗ yok: ${rel}`); continue; }
  if (basename(src) === 'MEMORY.md') { console.error(`✗ MEMORY.md arşivlenemez (üretilen dosya)`); continue; }

  const leaf = dirname(rel);                       // ör. personal/_kok
  if (!WORKSPACES.includes(leaf.split('/')[0])) {
    console.error(`✗ tanınmayan iş alanı: ${leaf} (beklenen: ${WORKSPACES.join('/')})`);
    continue;
  }

  const text = readFileSync(src, 'utf8');
  const end = text.indexOf('\n---', 4);
  if (end === -1) { console.error(`✗ frontmatter yok: ${rel}`); continue; }
  if (!/^status:/m.test(text.slice(0, end))) {
    writeFileSync(src, `${text.slice(0, end)}\nstatus: archived${text.slice(end)}`);
  }

  const destDir = join(ARCHIVE_DIR, leaf);         // archive/personal/_kok — provenance korunur
  mkdirSync(destDir, { recursive: true });
  const dest = join(destDir, basename(src));
  if (existsSync(dest)) { console.error(`✗ arşivde zaten var: ${relative(VAULT, dest)}`); continue; }

  renameSync(src, dest);
  console.log(`✓ ${rel} → ${relative(VAULT, dest)}`);
  ok++;
}

if (ok) {
  const { stale } = syncIndexes();
  console.log(`\n${ok} not arşivlendi, indeks eşitlendi${stale.length ? `: ${stale.join(', ')}` : ''}.`);
}
