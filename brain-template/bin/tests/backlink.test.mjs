// withBacklink() testleri.  node bin/tests/backlink.test.mjs
//
// 94 nota toplu yazacak bir fonksiyon: idempotent olmalı (iki kez çalışınca ikinci link
// eklememeli) ve frontmatter'a asla dokunmamalı.
import { withBacklink } from '../scripts/backlink.mjs';

let pass = 0;
const fails = [];
const eq = (label, got, want) => {
  const ok = got === want;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`
    + (ok ? '' : `\n  got:  ${JSON.stringify(got)}\n  want: ${JSON.stringify(want)}`));
  ok ? pass++ : fails.push(label);
};

const FM = '---\nname: b\nmetadata:\n  type: project\n---\n';

eq('İlgili satırı yoksa açılır',
  withBacklink(`${FM}gövde\n`, 'project_a'),
  `${FM}gövde\n\nİlgili: [[project_a]]\n`);

eq('mevcut İlgili satırına eklenir',
  withBacklink(`${FM}gövde\n\nİlgili: [[project_c]]\n`, 'project_a'),
  `${FM}gövde\n\nİlgili: [[project_c]], [[project_a]]\n`);

eq('zaten varsa değişmez (idempotent)',
  withBacklink(`${FM}gövde\n\nİlgili: [[project_a]]\n`, 'project_a'),
  `${FM}gövde\n\nİlgili: [[project_a]]\n`);

eq('iki kez uygulamak tek link bırakır',
  withBacklink(withBacklink(`${FM}gövde\n`, 'project_a'), 'project_a'),
  `${FM}gövde\n\nİlgili: [[project_a]]\n`);

eq('İlgili satırı nokta ile bitiyorsa nokta düşer',
  withBacklink(`${FM}gövde\n\nİlgili: [[project_c]].\n`, 'project_a'),
  `${FM}gövde\n\nİlgili: [[project_c]], [[project_a]]\n`);

eq('sondaki fazla boş satırlar normalize edilir',
  withBacklink(`${FM}gövde\n\n\n\n`, 'project_a'),
  `${FM}gövde\n\nİlgili: [[project_a]]\n`);

eq('gövdenin ortasındaki İlgili değil, SONUNCUSU kullanılır',
  withBacklink(`${FM}İlgili: [[eski]] diye başlayan alıntı\nsonra gövde\n\nİlgili: [[project_c]]\n`, 'project_a'),
  `${FM}İlgili: [[eski]] diye başlayan alıntı\nsonra gövde\n\nİlgili: [[project_c]], [[project_a]]\n`);

eq('frontmatter aynen korunur',
  withBacklink(`${FM}gövde\n`, 'project_a').startsWith(FM), true);

console.log(`\n${pass}/${pass + fails.length} PASS` + (fails.length ? `\nFAIL: ${fails.join('; ')}` : ''));
process.exit(fails.length ? 1 : 0);
