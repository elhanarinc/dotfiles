// Öz onarım katmanı testleri.  node bin/tests/selfheal.test.mjs
//
// NEDEN VAR: 2026-09-15'te link onarımı ve geri link yazımı "bildir" katmanından "yaz"
// katmanına taşındı. Otomatik YAZAN bir kodun sınırı testle pinlenmek zorunda: sınır
// kayarsa sistem kendi notlarını bozar, ki bu bildirimi kaçırmaktan çok daha pahalı.
// Pinlenen sözleşme: yalnız TEK ADAYLI mekanik eşleşme düzeltilir; belirsiz olan,
// hedefi olmayan ve zaten doğru olan link OLDUĞU GİBİ kalır.
import { writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  repairLinksInText, repairLinkFiles, backlinkPlan, groupBacklinks, applyBacklinks,
  withBacklink, unlinkedProjects, linkTargetIndex, maskCode,
} from '../scripts/lib.mjs';

const DIR = join(import.meta.dirname, 'tmp-selfheal');
const w = (f, body) => writeFileSync(join(DIR, f), body);
const note = (name, type, body) =>
  `---\nname: ${name}\nindex_title: T\nindex_hook: h\nmetadata:\n  type: ${type}\n---\n${body}\n`;
const project = (name, body) => note(name, 'project', body);
const reset = () => {
  rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
};
const index = (...names) => {
  const m = new Map();
  for (const n of names) {
    const k = n.toLowerCase().replace(/[-_\s]/g, '');
    if (!m.has(k)) m.set(k, new Set());
    m.get(k).add(n);
  }
  return m;
};

let pass = 0;
const fails = [];
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`
    + (ok ? '' : ` | got ${JSON.stringify(got)} want ${JSON.stringify(want)}`));
  ok ? pass++ : fails.push(label);
};

// --- repairLinksInText: mekanik onarımın sınırı -----------------------------
const one = index('project_a_b');
eq('kebab slug dosya adına çevrilir',
  repairLinksInText('bkz [[project-a-b]]', one).text, 'bkz [[project_a_b]]');
eq('zaten dosya adı olan linke dokunulmaz',
  repairLinksInText('bkz [[project_a_b]]', one).text, 'bkz [[project_a_b]]');
eq('büyük/küçük harf farkı onarılır',
  repairLinksInText('bkz [[Project_A_B]]', one).text, 'bkz [[project_a_b]]');
eq('.md uzantısı onarılır',
  repairLinksInText('bkz [[project-a-b.md]]', one).text, 'bkz [[project_a_b]]');

// KOD BLOĞU DOKUNULMAZ. 2026-09-16'da `functions/i/[[code]].ts` (Cloudflare Pages catch-all
// DOSYA ADI) ölü wikilink sanıldı. Gürültüden ibaret değil: tek adaylı bir `code` notu var
// olsaydı onarım o dosya adını sessizce yeniden yazardı — sessiz veri bozma.
// İndeks BİLEREK öyle kuruldu ki maskeleme olmasa onarım TETİKLENİR: `co_de` ve `pa_th`
// normalize edilince 'code'/'path' anahtarına düşüyor ve TEK aday oluyorlar. Yani bu testler
// "aday yoktu, o yüzden dokunmadı" diye önemsiz sebeple geçemez — maskeleme kalkarsa DÜŞER.
const codeIdx = index('co_de', 'pa_th', 'gercek_not');
eq('KONTROL: maskeleme olmasa onarılırdı (aday gerçekten tek)',
  repairLinksInText('metinde [[code]] var', codeIdx).text, 'metinde [[co_de]] var');
eq('satır-içi koddaki [[x]] onarılmaz',
  repairLinksInText('Route `functions/i/[[code]].ts` böyle.', codeIdx).text,
  'Route `functions/i/[[code]].ts` böyle.');
eq('fenced bloktaki [[x]] onarılmaz',
  repairLinksInText('```\nls [[path]]/x\n```', codeIdx).text, '```\nls [[path]]/x\n```');
eq('kod DIŞINDAKİ link yine onarılır',
  repairLinksInText('bkz [[gercek-not]] notu', codeIdx).text, 'bkz [[gercek_not]] notu');
eq('aynı satırda kod korunur, metin onarılır',
  repairLinksInText('kod `[[code]]` ve metin [[gercek-not]]', codeIdx).text,
  'kod `[[code]]` ve metin [[gercek_not]]');
const round = 'a `b` c ```\nd\n``` e';
eq('maskCode geri yüklemesi kayıpsız', maskCode(round).restore(maskCode(round).masked), round);

// Görünen ad ve başlık çapası KORUNUR: `[[hedef|ad]]` ve `[[hedef#baslik]]` biçimini bozmak
// notun okunabilirliğini sessizce mahveder.
eq('görünen ad korunur',
  repairLinksInText('bkz [[project-a-b|şu not]]', one).text, 'bkz [[project_a_b|şu not]]');

// Hedefi hiç olmayan link "yazılacak" işaretidir — fixlinks.mjs ile aynı sözleşme.
const miss = repairLinksInText('bkz [[henuz-yazilmamis]]', one);
eq('hedefi olmayan link bırakılır', miss.text, 'bkz [[henuz-yazilmamis]]');
eq('hedefi olmayan link unresolved döner', miss.unresolved, ['henuz-yazilmamis']);
eq('hedefi olmayan link düzeltme saymaz', miss.fixed, []);

// İKİ aday varsa hangisinin kastedildiği SEMANTİK bir karar → otomatiğin dışında.
const two = index('project_a_b', 'project-a-b');
eq('belirsiz aday varken dokunulmaz',
  repairLinksInText('bkz [[project a b]]', two).text, 'bkz [[project a b]]');

// Shell parçası ya da kod içindeki `[[ ... ]]` yanlış pozitif üretmemeli: hedefi olmadığı
// için zaten onarılmıyor (vault'ta `[[-r "$PWD"]]` gibi 4 örnek var).
eq('shell testi wikilink sanılsa da bozulmaz',
  repairLinksInText('if [[-r "$PWD"]]; then', one).text, 'if [[-r "$PWD"]]; then');

// --- repairLinkFiles: diske yazma -------------------------------------------
reset();
w('project_a_b.md', project('project-a-b', 'hedef'));
w('project_kaynak.md', project('project-kaynak', 'bkz [[project-a-b]]'));
const repaired = repairLinkFiles([join(DIR, 'project_kaynak.md')], index('project_a_b', 'project_kaynak'));
eq('dosya onarıldı ve rapor edildi',
  repaired.map((r) => `${r.from}>${r.to}`), ['project-a-b>project_a_b']);
eq('onarım diske yazıldı',
  readFileSync(join(DIR, 'project_kaynak.md'), 'utf8').includes('[[project_a_b]]'), true);
eq('onarılacak şey yoksa yazma da yok',
  repairLinkFiles([join(DIR, 'project_kaynak.md')], index('project_a_b', 'project_kaynak')), []);
eq('olmayan dosya patlatmaz', repairLinkFiles([join(DIR, 'yok.md')], index('x')), []);

// --- backlinkPlan: kaynak filtresi (yazma anı yolu) -------------------------
reset();
w('project_a.md', project('project-a', 'bkz [[project_b]]'));
w('project_b.md', project('project-b', 'link yok'));
w('project_c.md', project('project-c', 'bkz [[project_b]]'));
eq('leaf taraması iki borcu da görür',
  backlinkPlan([{ dir: DIR }]).map((c) => `${c.sourceName}>${c.target}`),
  ['project_a>project_b.md', 'project_c>project_b.md']);
eq('kaynak filtresi yalnız yazılan notu sayar',
  backlinkPlan([{ dir: DIR }], ['project_a.md']).map((c) => `${c.sourceName}>${c.target}`),
  ['project_a>project_b.md']);

// Aynı hedefe iki kaynak → TEK okuma-yazma turu, iki link.
const grouped = groupBacklinks(backlinkPlan([{ dir: DIR }]));
eq('aynı hedef tek girdide birleşir', grouped.size, 1);
applyBacklinks(backlinkPlan([{ dir: DIR }]));
const bText = readFileSync(join(DIR, 'project_b.md'), 'utf8');
eq('iki geri link de yazıldı',
  bText.includes('[[project_a]]') && bText.includes('[[project_c]]'), true);
eq('geri link yazıldıktan sonra borç kalmaz', backlinkPlan([{ dir: DIR }]), []);
eq('idempotent: ikinci tur yazmaz',
  readFileSync(join(DIR, 'project_b.md'), 'utf8'), bText);

// Hub tipleri (reference/feedback/user) tasarım gereği geri link almaz — otomatik yazma
// bu sınırı GENİŞLETMEMELİ, yoksa her feedback notu onlarca `İlgili:` satırı toplar.
reset();
w('project_a.md', project('project-a', 'bkz [[feedback_kural]]'));
w('feedback_kural.md', note('feedback-kural', 'feedback', 'kural'));
eq('hub notuna otomatik geri link yazılmaz', backlinkPlan([{ dir: DIR }]), []);

// Frontmatter'a asla dokunulmaz: geri link gövdenin sonundaki `İlgili:` satırına gider.
eq('frontmatter korunur',
  withBacklink(project('project-x', 'gövde'), 'project_y').startsWith('---\nname: project-x'), true);

// --- yardımcılar patlamıyor -------------------------------------------------
eq('unlinkedProjects dizi döner', Array.isArray(unlinkedProjects()), true);
eq('linkTargetIndex vault indeksini kurar', linkTargetIndex().size > 100, true);

rmSync(DIR, { recursive: true, force: true });
console.log(`\n${pass}/${pass + fails.length} PASS${fails.length ? `\nFAIL: ${fails.join(' · ')}` : ''}`);
process.exit(fails.length ? 1 : 0);
