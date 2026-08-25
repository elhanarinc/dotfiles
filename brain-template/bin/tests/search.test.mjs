// searchNotes() + fold() testleri.  node bin/tests/search.test.mjs
//
// NEDEN VAR: brain bugüne kadar PUSH-only bir sistemdi — oturum başında indeks basıyor,
// oturum sonunda inbox yazıyor, arada hiçbir şey yapmıyordu. Doğru notu bulmak, o notun
// TEK SATIRLIK index_hook'unun sorulan şeyi tesadüfen içermesine bağlıydı; gövde hiç
// açılmıyordu. Sonuç, kullanıcının elle "bak aslında şu şöyleydi, brainde vardı" demek
// zorunda kalmasıydı. searchNotes o boşluğu kapatan pull katmanı.
//
// Buradaki vakalar üç sınırı pinliyor:
//   1) Türkçe katlama — 'İ/I/ı' tuzağı aramada iki ayrı kelime üretmesin (aynı tuzak
//      project-uppercase-casing notunda siteyi bozmuştu),
//   2) tip çarpanı — bir DAVRANIŞ kuralını (feedback/user) kaçırmak en pahalı hata,
//      proje detayını kaçırmaktan önce gelmeli,
//   3) arşiv cezası — emekliye ayrılmış karar canlı olanı geçmemeli.
import { writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { searchNotes, fold } from '../scripts/lib.mjs';

const ROOT = join(import.meta.dirname, 'tmp-search');
const LIVE = join(ROOT, 'live');
const ARCH = join(ROOT, 'arch');

const note = (name, type, hook, body) =>
  `---\nname: ${name}\nindex_title: ${name}\nindex_hook: "${hook}"\ntype: ${type}\n---\n${body}\n`;

const w = (dir, file, body) => writeFileSync(join(dir, file), body);
const reset = () => {
  rmSync(ROOT, { recursive: true, force: true });
  mkdirSync(LIVE, { recursive: true });
  mkdirSync(ARCH, { recursive: true });
};

const live = (extra = []) => [{ dir: LIVE, label: 'ws/leaf' }, ...extra];
const withArchive = () => [{ dir: LIVE, label: 'ws/leaf' }, { dir: ARCH, label: 'archive', archive: true }];

let pass = 0;
const fails = [];
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`
    + (ok ? '' : ` | got ${JSON.stringify(got)} want ${JSON.stringify(want)}`));
  ok ? pass++ : fails.push(label);
};
const ok = (label, cond, detail = '') => eq(label, cond ? true : `false ${detail}`, true);
const files = (rows) => rows.map((r) => r.file);

// --- fold: Türkçe katlama ------------------------------------------------------
eq('fold: İ ve I aynı harfe iner', [fold('İSTANBUL'), fold('istanbul'), fold('ISTANBUL'), fold('ıstanbul')],
  ['istanbul', 'istanbul', 'istanbul', 'istanbul']);
eq('fold: ş/ğ/ü/ö/ç sadeleşir', fold('Işık ŞEKER ğüöç'), 'isik seker guoc');
eq('fold: boş girdi patlamaz', [fold(''), fold(null), fold(undefined)], ['', '', '']);

// --- alan ağırlığı -------------------------------------------------------------
reset();
w(LIVE, 'project_titlehit.md', note('garanti suresi', 'project', 'alakasiz', 'alakasiz govde'));
w(LIVE, 'project_bodyhit.md', note('baska bir sey', 'project', 'alakasiz', 'govdede garanti gecer'));
eq('başlık isabeti gövde isabetini geçer', files(searchNotes('garanti', live())),
  ['project_titlehit.md', 'project_bodyhit.md']);

reset();
w(LIVE, 'project_hookhit.md', note('baslik', 'project', 'hook icinde garanti var', 'bos'));
w(LIVE, 'project_bodyhit.md', note('baslik iki', 'project', 'alakasiz', 'govdede garanti gecer'));
eq('index_hook isabeti gövdeyi geçer', files(searchNotes('garanti', live())),
  ['project_hookhit.md', 'project_bodyhit.md']);

// --- Türkçe katlama uçtan uca --------------------------------------------------
reset();
w(LIVE, 'project_upper.md', note('GARANTİ SÜRESİ', 'project', 'h', 'g'));
ok('büyük harfli Türkçe başlık küçük sorguyla bulunur',
  files(searchNotes('garanti suresi', live())).includes('project_upper.md'));
reset();
w(LIVE, 'project_isik.md', note('ışık ayarı', 'project', 'h', 'g'));
ok('ı/i farkı sorguyu düşürmez', files(searchNotes('isik', live())).includes('project_isik.md'));

// --- tip çarpanı ---------------------------------------------------------------
reset();
w(LIVE, 'feedback_rule.md', note('kural', 'feedback', 'h', 'reddit onerme'));
w(LIVE, 'project_detail.md', note('detay', 'project', 'h', 'reddit onerme'));
eq('aynı isabette feedback proje notunu geçer', files(searchNotes('reddit', live())),
  ['feedback_rule.md', 'project_detail.md']);

reset();
w(LIVE, 'user_pref.md', note('tercih', 'user', 'h', 'reddit onerme'));
w(LIVE, 'reference_doc.md', note('kaynak', 'reference', 'h', 'reddit onerme'));
eq('user tipi de reference üstünde', files(searchNotes('reddit', live())),
  ['user_pref.md', 'reference_doc.md']);

// --- arşiv cezası --------------------------------------------------------------
reset();
w(LIVE, 'project_live.md', note('canli karar', 'project', 'h', 'polar odeme rayi'));
w(ARCH, 'project_dead.md', note('emekli karar', 'project', 'h', 'polar odeme rayi'));
eq('canlı not arşivi geçer', files(searchNotes('polar', withArchive())),
  ['project_live.md', 'project_dead.md']);
ok('arşiv satırı işaretlenir',
  searchNotes('polar', withArchive()).find((r) => r.file === 'project_dead.md')?.archive === true);

// --- çok terimli sorgu ---------------------------------------------------------
reset();
w(LIVE, 'project_both.md', note('baslik', 'project', 'h', 'aso keyword calismasi'));
w(LIVE, 'project_one.md', note('baslik iki', 'project', 'h', 'sadece aso gecer'));
eq('iki terim eşleşen tek terimi geçer', files(searchNotes('aso keyword', live())),
  ['project_both.md', 'project_one.md']);
eq('hiç eşleşmeyen düşer', files(searchNotes('bulunmayanterim', live())), []);

// --- tip filtresi --------------------------------------------------------------
reset();
w(LIVE, 'feedback_a.md', note('a', 'feedback', 'h', 'tablo kullanma'));
w(LIVE, 'project_b.md', note('b', 'project', 'h', 'tablo kullanma'));
eq('--type feedback yalnız feedback döndürür',
  files(searchNotes('tablo', live(), { type: 'feedback' })), ['feedback_a.md']);

// --- kapsam: verilmeyen dizin taranmaz ----------------------------------------
reset();
w(LIVE, 'project_in.md', note('kapsamda', 'project', 'h', 'sizinti testi'));
w(ARCH, 'project_out.md', note('kapsam disi', 'project', 'h', 'sizinti testi'));
eq('kapsam dışı dizin sızmaz', files(searchNotes('sizinti', live())), ['project_in.md']);

// --- alıntı --------------------------------------------------------------------
reset();
w(LIVE, 'project_snip.md', note('baslik', 'project', 'h',
  `${'dolgu '.repeat(40)}ARANAN-TERIM buradaydi ${'dolgu '.repeat(40)}`));
const snip = searchNotes('aranan-terim', live())[0];
ok('alıntı isabeti içerir', fold(snip.excerpt).includes('aranan-terim'), snip?.excerpt);
ok('alıntı kısa kalır (<200 karakter)', snip.excerpt.length < 200, String(snip?.excerpt?.length));

// --- MEMORY.md taranmaz -------------------------------------------------------
reset();
w(LIVE, 'MEMORY.md', '- [x](x.md) — uretilmis indeks satiri kopya');
w(LIVE, 'project_real.md', note('gercek', 'project', 'h', 'kopya'));
eq('üretilmiş MEMORY.md sonuçlara girmez', files(searchNotes('kopya', live())), ['project_real.md']);

// --- dayanıklılık --------------------------------------------------------------
reset();
eq('boş dizin boş sonuç', searchNotes('herhangi', live()), []);
eq('olmayan dizin patlamaz', searchNotes('herhangi', [{ dir: join(ROOT, 'yok'), label: 'x' }]), []);
eq('boş sorgu boş sonuç', searchNotes('   ', live()), []);

rmSync(ROOT, { recursive: true, force: true });
console.log(`\n${pass}/${pass + fails.length} PASS`
  + (fails.length ? `\nFAIL: ${fails.join('; ')}` : ''));
process.exit(fails.length ? 1 : 0);
