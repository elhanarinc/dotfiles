// Obsidian wikilink onarımı. `[[hedef]]` Obsidian'da DOSYA ADIYLA çözülür, notun
// frontmatter'ındaki `name:` slug'ıyla değil — geçmiş oturumlar ikisini karıştırdığı için
// bağlantıların bir kısmı Obsidian'da gri/ölü görünüyor.
//
// SADECE mekanik uyuşmazlıkları düzeltir (tire↔alt çizgi, büyük/küçük harf, .md uzantısı) ve
// yalnızca TEK bir aday varsa yazar. Hedefi gerçekten olmayan linkler (henüz yazılmamış not)
// KASITLI bırakılır — onlar "yazılacak" işaretidir, hata değil.
//
// Onarım mantığı lib.mjs'e taşındı (`repairLinksInText`), çünkü artık üç
// tüketicisi var — bu CLI, PostToolUse hook'u ve SessionStart süpürmesi. Bu script birikmişi
// TÜM vault'ta (arşiv + inbox + docs dahil) kapatan toplu koldur; hook'lar yalnız leaf
// notlarına bakar.
//
//   node bin/scripts/fixlinks.mjs          → sadece rapor
//   node bin/scripts/fixlinks.mjs --apply  → düzeltmeleri yaz
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { VAULT, linkTargetIndex, repairLinksInText, syncIndexes } from './lib.mjs';

const apply = process.argv.includes('--apply');

const mdFiles = [];
const walk = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = join(d, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (e.name.endsWith('.md')) mdFiles.push(p);
  }
};
walk(VAULT);

const index = linkTargetIndex();
let scanned = 0, fixed = 0;
const unresolved = [];

for (const p of mdFiles) {
  const text = readFileSync(p, 'utf8');
  const r = repairLinksInText(text, index);
  scanned += r.scanned;
  fixed += r.fixed.length;
  for (const u of r.unresolved) unresolved.push(`${p.replace(`${VAULT}/`, '')}  →  [[${u}]]`);
  if (r.fixed.length && apply) writeFileSync(p, r.text);
}

console.log(`${mdFiles.length} dosya · ${scanned} wikilink`);
console.log(`${apply ? 'düzeltildi' : 'düzeltilebilir'}: ${fixed}`);
console.log(`hedefi hiç olmayan (kasıtlı bırakıldı): ${unresolved.length}`);
for (const u of unresolved) console.log(`   · ${u}`);
if (apply && fixed) {
  syncIndexes();
  console.log('\nindeks eşitlendi.');
}
