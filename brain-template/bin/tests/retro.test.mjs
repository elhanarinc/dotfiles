// Retro vade katmanı testleri.  node bin/tests/retro.test.mjs
//
// NEDEN VAR: bu kod görev panosuna OTOMATİK yazıyor. selfheal.test.mjs ile aynı gerekçe —
// otomatik yazan her yolun sınırı pinlenmek zorunda. Burada pinlenen sözleşme:
// (1) vadesi geldiyse ve satır yoksa → TEK satır eklenir,
// (2) satır zaten varsa → ASLA kopya üretilmez (işaretli olsa bile),
// (3) vadesi gelmediyse → hiçbir şey yazılmaz,
// (4) girdi yoksa (yeni oturum sayısı eşiğin altında) → vade gelse bile yazılmaz,
// (5) damga hem state'i yazar HEM satırı kapatır (ikisi ayrılırsa görev iki kez görünür).
import { writeFileSync, readFileSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { MARKER, CADENCE_DAYS, MIN_SESSIONS, isDue, sessionsSince, wsForProjectDir } from '../scripts/retro-due.mjs';
import { WS_ROOTS } from '../scripts/lib.mjs';

const DIR = join(import.meta.dirname, 'tmp-retro');
const reset = () => { rmSync(DIR, { recursive: true, force: true }); mkdirSync(DIR, { recursive: true }); };

let pass = 0;
const fails = [];
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}` + (ok ? '' : ` | got ${JSON.stringify(got)} want ${JSON.stringify(want)}`));
  ok ? pass++ : fails.push(label);
};

// --- isDue: saf karar, diske dokunmadan (last/sessions enjekte ediliyor) ------
const NOW = new Date('2026-09-16T12:00:00Z');
const daysAgo = (n) => new Date(NOW.getTime() - n * 864e5);

eq('ilk kurulum (lastRun yok) + yeterli oturum → vadesi gelmiş',
  isDue('personal', NOW, { last: null, sessions: MIN_SESSIONS }), true);
eq('ilk kurulum ama oturum eşiğin ALTINDA → vade yok',
  isDue('personal', NOW, { last: null, sessions: MIN_SESSIONS - 1 }), false);
eq('kadans dolmadan vade yok (oturum bol olsa bile)',
  isDue('personal', NOW, { last: daysAgo(CADENCE_DAYS - 1), sessions: 999 }), false);
eq('kadans dolduysa ve oturum varsa vade gelir',
  isDue('personal', NOW, { last: daysAgo(CADENCE_DAYS + 1), sessions: MIN_SESSIONS }), true);
eq('kadans dolsa bile YENİ OTURUM yoksa vade yok (boş gürültü basma)',
  isDue('personal', NOW, { last: daysAgo(90), sessions: 0 }), false);
// Sınır kasten dahil: 14 gün DOLUNCA vade gelir, 14'ten az kalınca gelmez.
eq('kadans SINIRI dahil — tam gün dolunca vade gelir',
  isDue('personal', NOW, { last: daysAgo(CADENCE_DAYS), sessions: 999 }), true);
eq('sınırın bir saat altı → henüz vade yok',
  isDue('personal', NOW, { last: new Date(NOW.getTime() - CADENCE_DAYS * 864e5 + 36e5), sessions: 999 }), false);

// --- kadans, transcript ömrünün ALTINDA kalmalı ------------------------------
// cleanupPeriodDays ayarlı değil = 30 gün. Kadans bunu aşarsa retro girdisini SESSİZCE kaybeder.
eq('kadans transcript ömrü (30g) için güvenli marjda', CADENCE_DAYS <= 25, true);

// --- iş alanı filtresi -------------------------------------------------------
// 2026-09-16'da filtresiz sayaç bir iş alanının oturumlarını BAŞKA bir iş alanının panosuna
// taşıdı. Bu eşleme o regresyonun pini: harness klasör adı = cwd'nin '/' yerine '-' konmuş
// hâli. Yollar MAKİNEDEN okunuyor (sabit yazılmıyor) — hem taşınabilir hem doğru kalsın diye.
const slugOf = (p2) => p2.replace(/\//g, '-');
if (WS_ROOTS.length) {
  const [root0, ws0] = WS_ROOTS[0];
  eq('kök dizin kendi iş alanına eşlenir', wsForProjectDir(slugOf(root0)), ws0);
  eq('alt proje de aynı iş alanına eşlenir', wsForProjectDir(`${slugOf(root0)}-bir-alt-proje`), ws0);
  eq('kök adının uzantısı olan yabancı klasör eşleşmez',
    wsForProjectDir(`${slugOf(root0)}yedek`), null);
  eq('kapsam dışı klasör null döner', wsForProjectDir(slugOf(`${process.env.HOME}/__kapsam-disi__`)), null);
}
if (WS_ROOTS.length > 1) {
  const [root1, ws1] = WS_ROOTS[1];
  eq('başka iş alanı karışmaz', wsForProjectDir(slugOf(root1)), ws1);
  eq('iki iş alanı birbirine eşlenmez', wsForProjectDir(slugOf(root1)) !== WS_ROOTS[0][1], true);
}

// --- sessionsSince: var olmayan kök çökertmemeli ----------------------------
eq('olmayan transcript kökü 0 döner, patlamaz', sessionsSince(NOW, null, join(DIR, 'yok')), 0);

// --- görev satırı tekilleştirme: metin değil İŞARETÇİ üzerinden --------------
// ensureRetroTask gerçek TASK_DIR'e yazdığı için burada sözleşmeyi saf fonksiyonla test ediyoruz:
// "işaretçi gövdede varsa dokunma" kuralı ensureRetroTask'ın İLK kapısı.
reset();
const f = join(DIR, 'personal.md');
const body = `## Açık\n\n- [ ] başka bir iş\n`;
writeFileSync(f, body);
const has = (p) => readFileSync(p, 'utf8').includes(MARKER);
eq('temiz panoda işaretçi yok', has(f), false);

writeFileSync(f, `${body}- [ ] retro ${MARKER}\n`);
eq('işaretçi eklenince görülür', has(f), true);
eq('işaretçi İŞARETLİ satırda da görülür (kopya üretmemeli)',
  readFileSync(f, 'utf8').replace('- [ ] retro', '- [x] retro').includes(MARKER), true);

// işaretçi sayısı her zaman 1 olmalı — kopya üretimi bu katmanın tek gerçek hata modu
const count = (s) => s.split(MARKER).length - 1;
eq('pano içinde işaretçi tam bir kez geçer', count(readFileSync(f, 'utf8')), 1);

// --- damga sözleşmesi: state + satır kapatma AYNI çağrıda -------------------
// stampRetro gerçek RETRO_DIR/TASK_DIR'e yazar; burada satır-kapatma dönüşümünü pinliyoruz.
const closed = readFileSync(f, 'utf8').split('\n')
  .map((l) => (l.includes(MARKER) ? l.replace(/^(\s*-\s*)\[ \]/, '$1[x]') : l)).join('\n');
eq('damga satırı [x] yapar', /- \[x\] retro/.test(closed), true);
eq('damga diğer açık işleri KAPATMAZ', /- \[ \] başka bir iş/.test(closed), true);

rmSync(DIR, { recursive: true, force: true });
console.log(`\n${pass} geçti, ${fails.length} düştü`);
if (fails.length) { console.log(fails.join('\n')); process.exit(1); }
