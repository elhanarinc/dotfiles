// scanTranscript() + shouldNudge() testleri.  node bin/tests/nudge.test.mjs
//
// NEDEN VAR: kullanıcı 2026-08-25'te üçüncü kez aynı şeyi söyledi — "kapatırken braine
// kaydetmeyi unutma demem gerekiyor". Yazma kararı bugüne kadar %100 modelin oturum
// ortasında kendiliğinden hatırlamasına bağlıydı ve bunu hatırlatan hiçbir mekanizma yoktu:
// capture.mjs kalıcı olanı seçmeyi BİLEREK reddediyor, inbox kaydı da oturum bittikten
// SONRA yazılıyor (dürtü olarak çok geç).
//
// nudge.mjs o boşluğu kapatıyor: Stop hook, eşiği geçmiş ve hiç not yazmamış bir oturumda
// TEK SEFER exit 2 döner. Stop hook'ta exit 0 çıktısı yalnız debug log'una gidiyor (doğrulandı,
// code.claude.com/docs/en/hooks) — modele ulaşan tek kanal exit 2 + stderr.
//
// Eşik BİLEREK yüksek: her turda konuşan bir hook üç günde görmezden gelinir hale gelir.
// Buradaki vakalar o eşiği pinliyor.
import { writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { scanTranscript, shouldNudge } from '../scripts/lib.mjs';

const DIR = join(import.meta.dirname, 'tmp-nudge');
const HOME = process.env.HOME;
const VAULT_NOTE = `${HOME}/Obsidian/brain/personal/_kok/deneme_notu.md`;

let pass = 0;
const fails = [];
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`
    + (ok ? '' : ` | got ${JSON.stringify(got)} want ${JSON.stringify(want)}`));
  ok ? pass++ : fails.push(label);
};

// --- transcript kurgusu -------------------------------------------------------
const userLine = (text) => JSON.stringify({ type: 'user', message: { content: text } });
const bashLine = (command) => JSON.stringify({
  type: 'assistant',
  message: { content: [{ type: 'tool_use', name: 'Bash', input: { command } }] },
});
const writeLine = (file_path) => JSON.stringify({
  type: 'assistant',
  message: { content: [{ type: 'tool_use', name: 'Write', input: { file_path } }] },
});

const transcript = (lines) => {
  rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
  const p = join(DIR, 'session.jsonl');
  writeFileSync(p, `${lines.join('\n')}\n`);
  return p;
};

// --- scanTranscript: promptlar ------------------------------------------------
let scan = scanTranscript(transcript([userLine('birinci'), userLine('ikinci')]), '/tmp/proje');
eq('promptlar sırayla toplanır', scan.prompts, ['birinci', 'ikinci']);

scan = scanTranscript(transcript([
  JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', content: 'cikti' }] } }),
  userLine('gercek prompt'),
  JSON.stringify({ type: 'user', isMeta: true, message: { content: 'meta' } }),
  userLine('<system-reminder>gormezden gel</system-reminder>'),
]), '/tmp/proje');
eq('tool_result / isMeta / system-reminder prompt sayılmaz', scan.prompts, ['gercek prompt']);

// --- scanTranscript: BUGÜNÜN HATASI — Bash ile yazılan not görünmeli ----------
scan = scanTranscript(transcript([
  userLine('bir'), userLine('iki'), userLine('uc'),
  bashLine(`cat > ${VAULT_NOTE} <<'EOF'\nicerik\nEOF`),
]), '/tmp/proje');
eq('Bash heredoc ile yazılan vault notu `notes`a girer', scan.notes, ['deneme_notu']);
eq('Bash yazımı `touched`ı kirletmez', scan.files, []);

scan = scanTranscript(transcript([writeLine(VAULT_NOTE)]), '/tmp/proje');
eq('Write ile yazılan vault notu da `notes`a girer', scan.notes, ['deneme_notu']);

scan = scanTranscript(transcript([
  bashLine(`cat > ${HOME}/Obsidian/brain/personal/_kok/MEMORY.md <<'E'`),
]), '/tmp/proje');
eq('üretilmiş MEMORY.md not sayılmaz', scan.notes, []);

scan = scanTranscript(transcript([writeLine('/tmp/proje/src/app.ts')]), '/tmp/proje');
eq('proje dosyası `touched`a, `notes`a değil', [scan.files, scan.notes], [['src/app.ts'], []]);

// --- scanTranscript: ops -----------------------------------------------------
scan = scanTranscript(transcript([bashLine('git push origin master')]), '/tmp/proje');
eq('mutasyon komutu ops sayılır', scan.ops.length, 1);
scan = scanTranscript(transcript([bashLine('git status')]), '/tmp/proje');
eq('okuma komutu ops sayılmaz', scan.ops, []);

// --- scanTranscript: dayanıklılık --------------------------------------------
eq('olmayan transcript boş döner',
  scanTranscript(join(DIR, 'yok.jsonl'), '/tmp'), { prompts: [], files: [], notes: [], ops: [] });
eq('bozuk satır atlanır',
  scanTranscript(transcript(['{bozuk json', userLine('saglam')]), '/tmp').prompts, ['saglam']);

// --- shouldNudge: eşik -------------------------------------------------------
const S = (prompts, ops, files, notes) => ({ prompts, ops, files, notes });
eq('3 promptun altı sessiz', shouldNudge(S(['a', 'b'], ['git push'], [], [])), false);
eq('içerik yoksa sessiz (sadece sohbet)', shouldNudge(S(['a', 'b', 'c'], [], [], [])), false);
eq('not zaten yazılmışsa sessiz', shouldNudge(S(['a', 'b', 'c'], ['git push'], [], ['bir_not'])), false);
eq('eşik + ops + notsuz → dürt', shouldNudge(S(['a', 'b', 'c'], ['git push'], [], [])), true);
eq('eşik + dosya yazması + notsuz → dürt', shouldNudge(S(['a', 'b', 'c'], [], ['src/a.ts'], [])), true);
eq('boş tarama sessiz', shouldNudge(S([], [], [], [])), false);
eq('eksik alanlar patlamaz', shouldNudge({}), false);

rmSync(DIR, { recursive: true, force: true });
console.log(`\n${pass}/${pass + fails.length} PASS`
  + (fails.length ? `\nFAIL: ${fails.join('; ')}` : ''));
process.exit(fails.length ? 1 : 0);
