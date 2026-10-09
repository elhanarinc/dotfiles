// curate.mjs (inbox küratörü) testleri.  node bin/tests/curate.test.mjs
//
// NEDEN VAR: 2026-10-09'da küratörlük insansız hale geldi (launchd + `claude -p`). Model turu
// burada test edilmez; test edilen, modelin ETRAFINDAKİ deterministik sözleşme: hangi kayıt
// süpürülür, hangisi modele gider, özet secret/araç çıktısı taşımaz, kayıt silinmez ama
// işaretlenir ve mtime korunur (brief "son oturum"u mtime'la seçiyor), bayat küratör bağırır.
import { writeFileSync, rmSync, mkdirSync, statSync, utimesSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  listRecords, sweep, pendingForModel, markCurated, condenseClaude, condenseCodex, fitDigest,
  buildDigest, parseResults, MIN_AGE_MS, KEEP_DAYS,
} from '../scripts/curate.mjs';
import { curatorLine } from '../scripts/lib.mjs';

const DIR = join(import.meta.dirname, 'tmp-curate');
let pass = 0;
const fails = [];
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}` + (ok ? '' : ` | got ${JSON.stringify(got)} want ${JSON.stringify(want)}`));
  ok ? pass++ : fails.push(label);
};

rmSync(DIR, { recursive: true, force: true });
mkdirSync(join(DIR, 'inbox', 'ws'), { recursive: true });
const now = Date.now();
const iso = (ms) => new Date(ms).toISOString();
const rec = (name, fm) => {
  const p = join(DIR, 'inbox', 'ws', name);
  writeFileSync(p, `---\n${Object.entries(fm).map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n# gövde\n`);
  return p;
};

rec('a-notlu.md', { ended: iso(now - 2 * 864e5), notes: '"var_olan_not, zz_probe"', status: 'unprocessed' });
rec('b-notsuz.md', { ended: iso(now - 2 * 864e5), notes: '""', status: 'unprocessed' });
rec('c-taze.md', { ended: iso(now - MIN_AGE_MS / 2), notes: '""', status: 'unprocessed' });
rec('d-eski-islenmis.md', { ended: iso(now - (KEEP_DAYS + 2) * 864e5), status: 'curated', curated_at: iso(now - (KEEP_DAYS + 1) * 864e5) });
rec('e-yolu-yok.md', { ended: iso(now - 2 * 864e5), notes: '"silinmis_not"', status: 'unprocessed' });
const old = new Date(now - 5 * 864e5);
utimesSync(join(DIR, 'inbox', 'ws', 'a-notlu.md'), old, old);

const records = listRecords(join(DIR, 'inbox'), ['ws']);
eq('5 kayıt okunuyor, ended sırasıyla', records.length, 5);

const sw = sweep(records, { names: new Set(['var_olan_not']), now });
eq('notu vault\'ta olan kayıt süpürülüyor (zz_ probe sayılmaz)', sw.closed.map((r) => r.file), ['a-notlu.md']);
eq('notu artık olmayan kayıt süpürülmüyor', sw.closed.some((r) => r.file === 'e-yolu-yok.md'), false);
eq('KEEP_DAYS geçmiş işlenmiş kayıt siliniyor', sw.deleted.map((r) => r.file), ['d-eski-islenmis.md']);
eq('silinen dosya diskte yok', existsSync(join(DIR, 'inbox', 'ws', 'd-eski-islenmis.md')), false);

const a = readFileSync(join(DIR, 'inbox', 'ws', 'a-notlu.md'), 'utf8');
eq('süpürülen kayıt silinmedi, status: curated', /^status: curated$/m.test(a), true);
eq('curated_by: sweep + notlar yazıldı', /curated_by: sweep\ncurated_notes: "var_olan_not"/.test(a), true);
eq('mtime korunuyor (brief sıralaması bozulmaz)', Math.round(statSync(join(DIR, 'inbox', 'ws', 'a-notlu.md')).mtimeMs / 1000), Math.round(old.getTime() / 1000));

const again = listRecords(join(DIR, 'inbox'), ['ws']);
eq('modele giden: işlenmemiş + 6 saatten eski', pendingForModel(again, now).map((r) => r.file).sort(), ['b-notsuz.md', 'e-yolu-yok.md']);

const b = again.find((r) => r.file === 'b-notsuz.md');
markCurated(b, { by: 'model:none', notes: [] });
markCurated(b, { by: 'model:written', notes: ['x'] });
const bt = readFileSync(b.path, 'utf8');
eq('tekrar işaretleme alanları çoğaltmıyor', (bt.match(/curated_by:/g) || []).length, 1);

// --- özet: araç çıktısı yok, secret redakte, meta atlanır ---
const claudeT = [
  { type: 'user', message: { content: 'deploy edelim mi? anahtar sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' } },
  { type: 'user', isMeta: true, message: { content: 'meta' } },
  { type: 'user', message: { content: '<system-reminder>x</system-reminder>' } },
  { type: 'assistant', message: { content: [{ type: 'text', text: 'Karar: deploy yok.' }, { type: 'tool_use', name: 'Bash', input: { command: 'ls -la' } }] } },
  { type: 'user', message: { content: [{ type: 'tool_result', content: 'GIZLI_CIKTI' }] } },
].map((e) => JSON.stringify(e)).join('\n');
const lines = condenseClaude(claudeT);
eq('Claude: prompt + asistan + araç başlığı, meta/system/tool_result yok', lines.length, 3);
eq('Claude: araç çıktısı özete girmiyor', lines.join('\n').includes('GIZLI_CIKTI'), false);

const tPath = join(DIR, 't.jsonl');
writeFileSync(tPath, claudeT);
const digest = buildDigest({ ws: 'ws', file: 'z.md', fm: { transcript: tPath, project: 'p' }, text: '' });
eq('özet secret\'ı redakte ediyor', digest.includes('sk-ant-api03-AAAA'), false);

const codexT = [
  { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '# AGENTS.md instructions <INSTRUCTIONS>' }] } },
  { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'sunucu kontrol ediyor mu?' }] } },
  { type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Evet, sunucuda.' }] } },
  { type: 'response_item', payload: { type: 'function_call', name: 'exec', arguments: '{"cmd":"rg x"}' } },
  { type: 'response_item', payload: { type: 'function_call_output', output: 'GIZLI' } },
].map((e) => JSON.stringify(e)).join('\n');
const cl = condenseCodex(codexT);
eq('Codex: AGENTS enjeksiyonu ve araç çıktısı yok', [cl.length, cl.join('').includes('GIZLI')], [3, false]);

const big = fitDigest(Array.from({ length: 2000 }, (_, i) => `satır ${i}`), 1000);
eq('uzun özet baş+son tutuluyor, sınır aşılmıyor', [big.length < 1100, big.includes('satır 0'), big.includes('satır 1999')], [true, true, true]);

// --- model cevabı ---
eq('JSON cevabı ön metinle bile ayrışıyor', parseResults('tamam:\n{"results":[{"record":"b.md","action":"none"}]}')?.length, 1);
eq('bozuk cevap null (kayıt işaretlenmez)', parseResults('yapamadım'), null);

// --- nabız satırı ---
const sp = join(DIR, 'status.json');
eq('status yoksa kurulum uyarısı', curatorLine(now, sp)?.startsWith('⚠️ Küratör hiç çalışmadı'), true);
writeFileSync(sp, JSON.stringify({ last_run: iso(now - 5 * 864e5), curated: 1, written: [] }));
eq('3 günden bayatsa bağırıyor', curatorLine(now, sp)?.startsWith('⚠️ Küratör 5 gündür'), true);
writeFileSync(sp, JSON.stringify({ last_run: iso(now - 3600e3), curated: 1, written: [], error: 'git: rejected' }));
eq('hata varsa bağırıyor', curatorLine(now, sp)?.includes('hata verdi: git: rejected'), true);
writeFileSync(sp, JSON.stringify({ last_run: iso(now - 3600e3), curated: 4, written: ['+a', '~b'], pending_left: 0 }));
eq('sağlıklıysa tek satır özet', curatorLine(now, sp)?.includes('4 oturum işlendi · not: +a, ~b'), true);

rmSync(DIR, { recursive: true, force: true });
console.log(`\n${pass} geçti, ${fails.length} kaldı`);
if (fails.length) process.exit(1);
