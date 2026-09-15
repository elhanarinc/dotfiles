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
import { noteWritesFromCommand, resolveNotePath, noteWriteLeaves, VAULT, WORKSPACES, WS_ROOTS } from '../scripts/lib.mjs';

const HOME = process.env.HOME;
let pass = 0;
const fails = [];
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`
    + (ok ? '' : ` | got ${JSON.stringify(got)} want ${JSON.stringify(want)}`));
  ok ? pass++ : fails.push(label);
};

const V = `${HOME}/Obsidian/brain/<ws>/_kok`;

// --- yönlendirme ---------------------------------------------------------------
eq('cat > heredoc hedefi', noteWritesFromCommand(`cat > ${V}/not.md <<'EOF'\ngovde\nEOF`), [`${V}/not.md`]);
eq('>> ekleme hedefi', noteWritesFromCommand(`echo satir >> ${V}/not.md`), [`${V}/not.md`]);
eq('tilde açılır', noteWritesFromCommand("cat > ~/Obsidian/brain/<ws>/_kok/t.md <<'E'"),
  [`${HOME}/Obsidian/brain/<ws>/_kok/t.md`]);
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


// --- resolveNotePath / noteWriteLeaves: İKİ TABANLI çözüm ----------------------
// NEDEN: baskın yazma biçimi `cd ~/Obsidian/brain && cat > <ws>/_kok/not.md`, ama
// hook'a gelen cwd OTURUMUN cwd'sidir (compound komutun İÇİNDEKİ cd değil). Tek tabanla
// (yalnız cwd) bu biçim sessizce çözülmez ve reindex hook'u hiçbir iş yapmaz — düzeltme
// "uygulanmış" görünürken çalışmaz. Sahada tam bu şekilde yakalandı.
// İş alanı adı ve kökü MAKİNEYE ÖZGÜ (bin/state/config.json) — teste gömülmez, oradan okunur.
const WS = WORKSPACES[0];
const SESSION_CWD = WS_ROOTS.find(([, name]) => name === WS)?.[0] ?? HOME;
const KOK = `${VAULT}/${WS}/_kok`;
// leafForFile yalnız DİZİNİ realpath eder, dosyanın var olması gerekmez — bu yüzden
// sabit sentetik bir ad kullanılıyor. Gerçek bir nota bağlamak testi kırılgan yapardı:
// not arşivlenir/yeniden adlandırılırsa üç assert alakasız bir sebeple düşer.
const REAL = 'zz-notewrites-fixture.md';

eq('mutlak vault yolu çözülür', resolveNotePath(`${KOK}/${REAL}`, SESSION_CWD), `${KOK}/${REAL}`);
eq('göreli yol VAULT tabanından çözülür (cwd yanlışken)',
  resolveNotePath(`${WS}/_kok/${REAL}`, SESSION_CWD), `${KOK}/${REAL}`);
eq('vault dışı göreli yol null döner', resolveNotePath('src/app.md', SESSION_CWD), null);
eq('vault dışı mutlak yol null döner', resolveNotePath('/tmp/x.md', SESSION_CWD), null);
eq('boş girdi null döner', resolveNotePath('', SESSION_CWD), null);

eq('cd + göreli heredoc yazımı leafe çözülür',
  noteWriteLeaves(`cd ~/Obsidian/brain && cat > ${WS}/_kok/${REAL} <<'E'`, SESSION_CWD).map((w) => w.file),
  [REAL]);
eq('MEMORY.md leaf listesine girmez (üretilen dosya)',
  noteWriteLeaves(`cd ~/Obsidian/brain && cat > ${WS}/_kok/MEMORY.md <<'E'`, SESSION_CWD), []);
eq('proje dosyası yazımı brain işi değil', noteWriteLeaves('cat > README.md <<E', SESSION_CWD), []);

// --- ÜÇÜNCÜ taban: komutun başındaki `cd <leaf-dizini>` -------------------------
// Sistem bu deliği kendi üzerinde gösterdi: bir not `cd <leaf> && cat > not.md`
// ile yazıldı, hiçbir tabana çözülmedi ve MEMORY.md bayat kaldı — hook "çalıştı" görünürken
// hiçbir iş yapmadı. İki taban (cwd + VAULT) yalnız vault KÖKÜNDEN göreli biçimi kurtarıyordu.
eq('cd <leaf-dizini> + çıplak dosya adı çözülür',
  noteWriteLeaves(`cd ${KOK} && cat > ${REAL} <<'E'`, SESSION_CWD).map((w) => w.file), [REAL]);
eq('cd hedefi tırnaklıysa da çözülür',
  noteWriteLeaves(`cd '${KOK}' && cat > ${REAL} <<'E'`, SESSION_CWD).map((w) => w.file), [REAL]);
eq('cd hedefi vault dışındaysa yanlış pozitif yok',
  noteWriteLeaves(`cd /tmp && cat > ${REAL} <<'E'`, SESSION_CWD), []);
eq('cd tabanı MEMORY.md muafiyetini bozmaz',
  noteWriteLeaves(`cd ${KOK} && cat > MEMORY.md <<'E'`, SESSION_CWD), []);

console.log(`\n${pass}/${pass + fails.length} PASS`
  + (fails.length ? `\nFAIL: ${fails.join('; ')}` : ''));
process.exit(fails.length ? 1 : 0);
