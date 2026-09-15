// Tek yönlü project↔project linklerine karşılık geri link ekler.
//
// NEDEN VAR: `oneWayLinks` (lib.mjs) yazma anında uyarıyor, ama o kontrol eklenmeden önce
// birikmiş 94 notluk bir borç vardı ve yeni kontrol yalnız DOKUNULAN notta ateşlendiği için
// bu birikim kendiliğinden yüzeye çıkmıyordu. Bu script birikmiş kısmı tek seferde kapatır.
//
// NE YAPAR: A notu B'ye link veriyor ama B vermiyorsa, B'nin sonundaki `İlgili:` satırına
// `[[A]]` ekler (satır yoksa açar). Vault'ta yerleşik konvansiyon bu. Frontmatter'a dokunmaz.
//
// NE YAPMAZ: hub notlarına (reference/feedback/user) geri link eklemez, hedefi olmayan
// linkleri onarmaz (o fixlinks.mjs'in işi), arşivli notlara dokunmaz.
//
// Vault git altında olsa bile commit'ler seyrek ve toplu olabilir: iki commit arasında
// --apply'ın ne yazdığını git söylemez. O yüzden her çalışma değiştirdiği dosyaların listesini
// bin/state/backlink-<zaman>.log'a yazar — çalışma bazında geri alma kaydı budur.
//
// Plan/yazma/gruplama mantığı lib.mjs'e taşındı (`backlinkPlan`/`applyBacklinks`),
// çünkü aynı iş artık yazma anında (PostToolUse) ve oturum açılışında da yapılıyor. Bu CLI
// TÜM vault'u tarayan toplu koldur ve hâlâ tek başına rapor modunda çalışabilir.
//
//   node bin/scripts/backlink.mjs          → sadece rapor
//   node bin/scripts/backlink.mjs --apply  → geri linkleri yaz
import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import { VAULT, backlinkPlan, groupBacklinks, applyBacklinks, withBacklink } from './lib.mjs';

// Testler bu adı buradan içe aktarıyor; gerçek gövdesi artık lib.mjs'te (tek kaynak).
export { withBacklink };

const apply = process.argv.includes('--apply');

// Modül olarak import edilince (testler) gövde ÇALIŞMAMALI: --apply argv'de olsaydı içe
// aktarmanın yan etkisi 89 nota yazmak olurdu.
const runDirectly = process.argv[1] && import.meta.filename === realpathSync(process.argv[1]);
if (!runDirectly) { /* sadece withBacklink dışa aktarılır */ } else main();

function main() {
  const changes = backlinkPlan();
  const rel = (p) => p.replace(`${VAULT}/`, '');

  for (const { path, sources } of groupBacklinks(changes).values()) {
    console.log(`${apply ? 'YAZILDI ' : 'eksik   '} ${rel(path)}  ←  ${sources.join(', ')}`);
  }

  if (apply && changes.length) {
    const log = join(VAULT, 'bin', 'state', `backlink-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
    const written = applyBacklinks(changes, { log });
    console.log(`\n${written.size} nota geri link yazıldı · log: ${rel(log)}`);
  } else {
    const n = groupBacklinks(changes).size;
    console.log(`\n${n} not geri link bekliyor` + (n ? ' (--apply ile yaz)' : ''));
  }
}
