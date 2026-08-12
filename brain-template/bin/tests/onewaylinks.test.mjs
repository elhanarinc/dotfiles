// oneWayLinks() testleri.  node bin/tests/onewaylinks.test.mjs
//
// NEDEN VAR: kural "her link simetrik olmalı" olsaydı vault genelinde 179 notu işaretliyordu
// (ölçüldü) — her yazmada ateşleyip görmezden gelinen bir uyarı. Daraltılmış kural (yalnız
// project↔project, hedefi var olan linkler) 94'e indi ve tek bir yazmada 0-2 satır üretiyor.
// Buradaki vakalar o sınırı pinliyor: hub tipleri ve yazılmamış hedefler SESSİZ kalmalı.
import { writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { oneWayLinks } from '../scripts/lib.mjs';

const DIR = join(import.meta.dirname, 'tmp-onewaylinks');
const w = (f, body) => writeFileSync(join(DIR, f), body);
const note = (name, type, body) =>
  `---\nname: ${name}\nindex_title: T\nindex_hook: h\nmetadata:\n  type: ${type}\n---\n${body}\n`;
const project = (name, body) => note(name, 'project', body);
const reset = () => {
  rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
};

let pass = 0;
const fails = [];
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`
    + (ok ? '' : ` | got ${JSON.stringify(got)} want ${JSON.stringify(want)}`));
  ok ? pass++ : fails.push(label);
};

reset();
w('project_a.md', project('project-a', 'bkz [[project_b]]'));
w('project_b.md', project('project-b', 'hicbir link yok'));
eq('tek yönlü peer link yakalanır', oneWayLinks(DIR, 'project_a.md'), ['project_b.md']);
eq('linki olmayan not temiz', oneWayLinks(DIR, 'project_b.md'), []);

w('project_b.md', project('project-b', 'geri link [[project_a]]'));
eq('geri link eklenince susar', oneWayLinks(DIR, 'project_a.md'), []);

reset();
w('project_a.md', project('project-a', 'bkz [[project_b]]'));
w('project_b.md', project('project-b', 'slug ile geri link [[project-a]]'));
eq('slug/alt çizgi farkı geri link sayılır', oneWayLinks(DIR, 'project_a.md'), []);

reset();
w('project_a.md', project('project-a', 'bkz [[henuz-yazilmamis]]'));
eq('hedefi olmayan link kasıtlı, sayılmaz', oneWayLinks(DIR, 'project_a.md'), []);

reset();
w('project_a.md', project('project-a', 'kendine link [[project_a]]'));
eq('kendine link sayılmaz', oneWayLinks(DIR, 'project_a.md'), []);

reset();
w('project_a.md', project('project-a', '[[project_b]] ve [[project_c]]'));
w('project_b.md', project('project-b', 'yok'));
w('project_c.md', project('project-c', '[[project_a]]'));
eq('yalnız geri linki olmayan hedef raporlanır', oneWayLinks(DIR, 'project_a.md'), ['project_b.md']);

reset();
w('project_a.md', project('project-a', '[[project_b|farkli metin]] ve [[project_c#bolum]]'));
w('project_b.md', project('project-b', 'yok'));
w('project_c.md', project('project-c', 'yok'));
eq('alias ve heading içeren linkler ayrıştırılır',
  oneWayLinks(DIR, 'project_a.md'), ['project_b.md', 'project_c.md']);

reset();
w('project_a.md', project('project-a', '[[reference_b]] hub notuna link'));
w('reference_b.md', note('reference-b', 'reference', 'hub, geri link vermez'));
eq('reference hedefi hub sayılır, raporlanmaz', oneWayLinks(DIR, 'project_a.md'), []);

reset();
w('feedback_a.md', note('feedback-a', 'feedback', '[[project_b]]'));
w('project_b.md', project('project-b', 'yok'));
eq('hub notundan çıkan link raporlanmaz', oneWayLinks(DIR, 'feedback_a.md'), []);

reset();
eq('olmayan dosya için boş döner', oneWayLinks(DIR, 'yok.md'), []);

rmSync(DIR, { recursive: true, force: true });
console.log(`\n${pass}/${pass + fails.length} PASS`
  + (fails.length ? `\nFAIL: ${fails.join('; ')}` : ''));
process.exit(fails.length ? 1 : 0);
