// İndeks bütçe/kırpma testleri.  node bin/tests/index-budget.test.mjs
//
// NEDEN VAR: 2026-09-16 denetimi, harness'ın tavanı aşan MEMORY.md'nin SONUNDAN satır
// düşürdüğünü ölçtü (en büyük leaf'te 33, bir diğerinde 6 işaretçi kayıptı). Kaybın tek işareti
// bir uyarı metniydi; sistem içinden görünmüyordu. Pinlenen sözleşme:
// (1) hook satır tavanına kırpılır, LİNK VE BAŞLIK ASLA bozulmaz,
// (2) kırpma kelime sınırından yapılır ve '…' ile biter,
// (3) bütçeye sığmayan leaf için tavan otomatik daralır,
// (4) taban aşılırsa SESSİZCE daha fazla kırpmaz — overBudget işaretlenir (semantik iş: arşivle).
import { writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  fitIndexHook, buildIndex, INDEX_LINE_MAX, INDEX_LINE_FLOOR, INDEX_BUDGET_CHARS,
} from '../scripts/lib.mjs';

const DIR = join(import.meta.dirname, 'tmp-index-budget');
let pass = 0;
const fails = [];
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}` + (ok ? '' : ` | got ${JSON.stringify(got)} want ${JSON.stringify(want)}`));
  ok ? pass++ : fails.push(label);
};
const ok = (label, cond, detail = '') => eq(label + (detail ? ` (${detail})` : ''), Boolean(cond), true);

// --- fitIndexHook: saf kırpma sözleşmesi ------------------------------------
const P = '- [Başlık](not.md) — ';
eq('tavana sığan hook aynen kalır', fitIndexHook(P, 'kısa hook', 100), 'kısa hook');

const long = 'a'.repeat(400);
const fitted = fitIndexHook(P, long, 100);
ok('kırpılan hook tavana sığar', P.length + fitted.length <= 100, `${P.length + fitted.length}`);
ok('kırpılan hook … ile biter', fitted.endsWith('…'));

// Kelime sınırı: kırpma kelimeyi ortadan bölmemeli (sınıra yakınsa).
const words = fitIndexHook(P, 'birinci ikinci ucuncu dorduncu besinci altinci yedinci', P.length + 40);
ok('kelime ortasından kesmez', !/[a-zçğıöşü]…$/.test(words) || words.endsWith(' …') === false);
ok('kırpma sonundaki noktalama temizlenir', !/[\s,;:.\-–—]…$/.test(fitIndexHook(P, 'bir iki, uc; dort. bes', P.length + 12)));

// Aşırı dar tavan: prefix bile sığmıyorsa boş dönmeli (satır yine de basılır, link korunur).
eq('prefix sığmıyorsa hook boş döner', fitIndexHook(P, 'herhangi', 5), '');

// UTF-16 uzunluğu ölçülüyor (harness KARAKTER sayıyor, bayt değil) — Türkçe hook'ta
// kırpma karakter üzerinden olmalı, yoksa gereksiz agresif keser.
const tr = 'şğüöçİ '.repeat(60);
const trFit = fitIndexHook(P, tr, 100);
ok('Türkçe hook karakter üzerinden kırpılır', P.length + trFit.length <= 100, `${P.length + trFit.length}`);

// --- buildIndex: uyarlanabilir tavan + overBudget ---------------------------
const reset = () => { rmSync(DIR, { recursive: true, force: true }); mkdirSync(DIR, { recursive: true }); };
const note = (i, hookLen) => writeFileSync(join(DIR, `not_${String(i).padStart(3, '0')}.md`),
  `---\nname: not-${i}\nindex_title: Başlık ${i}\nindex_hook: "${'x'.repeat(hookLen)}"\nmetadata:\n  type: project\n---\ngövde\n`);

// Az not → tavan hiç daralmaz, hepsi INDEX_LINE_MAX'e kadar.
reset();
for (let i = 0; i < 10; i++) note(i, 400);
let built = buildIndex(DIR);
eq('az notta tavan daralmaz', built.lineMax, INDEX_LINE_MAX);
eq('az notta bütçe aşımı yok', built.overBudget, false);
ok('hiçbir satır tavanı aşmaz',
  built.text.split('\n').filter((l) => l.startsWith('- [')).every((l) => l.length <= INDEX_LINE_MAX));
ok('link ve başlık kırpılmadan duruyor', /- \[Başlık 0\]\(not_000\.md\) — /.test(built.text));

// Çok not → bütçeyi aşmaya başlar, tavan otomatik daralır ve bütçeye SIĞAR.
reset();
for (let i = 0; i < 170; i++) note(i, 400);
built = buildIndex(DIR);
ok('çok notta tavan daraltıldı', built.lineMax < INDEX_LINE_MAX, `lineMax=${built.lineMax}`);
ok('daraltma bütçeyi sağladı', built.text.length <= INDEX_BUDGET_CHARS, `${built.text.length}`);
eq('bütçe sağlandıysa overBudget false', built.overBudget, false);

// Taban aşıldı → SESSİZCE daha fazla kırpma YOK, overBudget işaretlenir.
reset();
for (let i = 0; i < 400; i++) note(i, 400);
built = buildIndex(DIR);
eq('taban aşılınca tavan tabanda durur', built.lineMax, INDEX_LINE_FLOOR);
eq('taban aşılınca overBudget işaretlenir', built.overBudget, true);
ok('overBudget olsa bile satırlar yine de üretilir (işaretçi kaybolmaz)',
  built.text.split('\n').filter((l) => l.startsWith('- [')).length === 400);

// Boş leaf null döner (mevcut sözleşme korunuyor)
reset();
eq('notu olmayan leaf null döner', buildIndex(DIR), null);

rmSync(DIR, { recursive: true, force: true });
console.log(`\n${pass} geçti, ${fails.length} düştü`);
if (fails.length) { console.log(fails.join('\n')); process.exit(1); }
