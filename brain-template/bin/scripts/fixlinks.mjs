// Obsidian wikilink onarımı. `[[hedef]]` Obsidian'da DOSYA ADIYLA çözülür, notun
// frontmatter'ındaki `name:` slug'ıyla değil — geçmiş oturumlar ikisini karıştırdığı için
// bağlantıların bir kısmı Obsidian'da gri/ölü görünüyor.
//
// SADECE mekanik uyuşmazlıkları düzeltir (tire↔alt çizgi, büyük/küçük harf, .md uzantısı) ve
// yalnızca TEK bir aday varsa yazar. Hedefi gerçekten olmayan linkler (henüz yazılmamış not)
// KASITLI bırakılır — onlar "yazılacak" işaretidir, hata değil.
//
//   node bin/scripts/fixlinks.mjs          → sadece rapor
//   node bin/scripts/fixlinks.mjs --apply  → düzeltmeleri yaz
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { VAULT, syncIndexes } from './lib.mjs';

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

// Aranabilir ad indeksi: dosya adı (uzantısız) → gerçek ad. Anahtar normalize edilmiş.
const key = (s) => s.toLowerCase().replace(/\.md$/, '').replace(/[-_\s]/g, '');
const byKey = new Map();
for (const p of mdFiles) {
  const base = p.split('/').pop().replace(/\.md$/, '');
  const k = key(base);
  if (!byKey.has(k)) byKey.set(k, new Set());
  byKey.get(k).add(base);
}

let scanned = 0, fixed = 0;
const unresolved = [];

for (const p of mdFiles) {
  const text = readFileSync(p, 'utf8');
  let out = text;
  // [[hedef]] ve [[hedef|görünen]] — başlık çapası (#) korunur
  out = out.replace(/\[\[([^\]|#]+)([^\]]*)\]\]/g, (whole, target, rest) => {
    scanned++;
    const t = target.trim();
    const base = t.replace(/\.md$/, '');
    // Zaten birebir bir dosya adıysa dokunma
    if (byKey.get(key(base))?.has(base)) return whole;
    const cands = byKey.get(key(base));
    if (!cands || cands.size !== 1) {
      if (!cands) unresolved.push(`${p.replace(`${VAULT}/`, '')}  →  [[${t}]]`);
      return whole;
    }
    fixed++;
    return `[[${[...cands][0]}${rest}]]`;
  });
  if (out !== text && apply) writeFileSync(p, out);
}

console.log(`${mdFiles.length} dosya · ${scanned} wikilink`);
console.log(`${apply ? 'düzeltildi' : 'düzeltilebilir'}: ${fixed}`);
console.log(`hedefi hiç olmayan (kasıtlı bırakıldı): ${unresolved.length}`);
for (const u of unresolved) console.log(`   · ${u}`);
if (apply && fixed) {
  syncIndexes();
  console.log('\nindeks eşitlendi.');
}
