// noteWritesFromCommand() testleri.  node bin/tests/notewrites.test.mjs
//
// NEDEN VAR: 2026-08-25'te inbox notlarının `notes:` alanı üç oturumda da BOŞ göründü, ama
// üçünden ikisi gerçekte brain notu yazmıştı — notların dosya doğum zamanları o oturumların
// içine düşüyordu, yani alan yanlış negatif veriyordu.
// Sebep: capture.mjs yalnız Write/Edit/MultiEdit/NotebookEdit tool_use çağrılarını tarıyordu,
// oysa bu makinede oturumlar dosyayı çoğu zaman Bash heredoc ile yazıyor (auto mode "Bash'i
// tercih et" diyor) — yani yanlış negatif istisna değil, VARSAYILAN durumdu.
//
// Bu fonksiyon o kör noktayı kapatıyor ve İKİ tüketicisi var: capture.mjs (`notes:` alanı) ve
// nudge.mjs ("bu oturumda hiç not yazılmadı mı?" eşiği). Tespit tek yerde, iki yerde değil.
//
// SINIR: sadece SHELL yazımları görülür. python/node script'inin içinden writeFileSync ile
// yazılan not görünmez — o katmanı okumak shell ayrıştırmasından çok daha pahalı ve kırılgan.
import { noteWritesFromCommand } from '../scripts/lib.mjs';

const HOME = process.env.HOME;
let pass = 0;
const fails = [];
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`
    + (ok ? '' : ` | got ${JSON.stringify(got)} want ${JSON.stringify(want)}`));
  ok ? pass++ : fails.push(label);
};

const V = `${HOME}/Obsidian/brain/personal/_kok`;

// --- yönlendirme ---------------------------------------------------------------
eq('cat > heredoc hedefi', noteWritesFromCommand(`cat > ${V}/not.md <<'EOF'\ngovde\nEOF`), [`${V}/not.md`]);
eq('>> ekleme hedefi', noteWritesFromCommand(`echo satir >> ${V}/not.md`), [`${V}/not.md`]);
eq('tilde açılır', noteWritesFromCommand("cat > ~/Obsidian/brain/personal/_kok/t.md <<'E'"),
  [`${HOME}/Obsidian/brain/personal/_kok/t.md`]);
eq('boşluk taşıyan tırnaklı yol', noteWritesFromCommand(`cat > "${V}/iki kelime.md" <<'E'`),
  [`${V}/iki kelime.md`]);

// --- yerinde düzenleme + tee ---------------------------------------------------
eq('sed -i (BSD, boş sonek)', noteWritesFromCommand(`sed -i '' 's/a/b/' ${V}/not.md`), [`${V}/not.md`]);
eq('sed -i (GNU)', noteWritesFromCommand(`sed -i 's/a/b/' ${V}/not.md`), [`${V}/not.md`]);
eq('tee hedefi', noteWritesFromCommand(`echo x | tee ${V}/not.md`), [`${V}/not.md`]);

// --- kopyalama / taşıma: yalnız HEDEF -----------------------------------------
eq('cp yalnız hedefi verir', noteWritesFromCommand(`cp /tmp/kaynak.md ${V}/hedef.md`), [`${V}/hedef.md`]);
eq('mv yalnız hedefi verir', noteWritesFromCommand(`mv ${V}/eski.md ${V}/yeni.md`), [`${V}/yeni.md`]);

// --- çoklu segment ------------------------------------------------------------
eq('&& ile zincir', noteWritesFromCommand(`mkdir -p ${V} && cat > ${V}/a.md <<'E'`), [`${V}/a.md`]);
eq('iki yazma tekilleştirilir', noteWritesFromCommand(`echo a > ${V}/a.md; echo b >> ${V}/a.md`), [`${V}/a.md`]);
eq('iki farklı hedef sırayla', noteWritesFromCommand(`echo a > ${V}/a.md; echo b > ${V}/b.md`),
  [`${V}/a.md`, `${V}/b.md`]);

// --- yazma OLMAYANLAR ---------------------------------------------------------
eq('okuma yönlendirmesi yok sayılır', noteWritesFromCommand(`cat ${V}/not.md`), []);
eq('grep hedef üretmez', noteWritesFromCommand(`grep -r terim ${V}/`), []);
eq('.md olmayan hedef alınmaz', noteWritesFromCommand(`cat > ${V}/veri.json <<'E'`), []);
eq('/dev/null yok sayılır', noteWritesFromCommand('cat > /dev/null'), []);
eq('rm yazma değildir', noteWritesFromCommand(`rm ${V}/not.md`), []);
eq('sed -i olmadan yazma yok', noteWritesFromCommand(`sed -n '1,5p' ${V}/not.md`), []);
eq('boş komut', noteWritesFromCommand(''), []);
eq('null komut', noteWritesFromCommand(null), []);

console.log(`\n${pass}/${pass + fails.length} PASS`
  + (fails.length ? `\nFAIL: ${fails.join('; ')}` : ''));
process.exit(fails.length ? 1 : 0);
