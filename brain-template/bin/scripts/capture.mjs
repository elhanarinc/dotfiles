// SessionEnd hook. Oturum biterken inbox'a ham bir yakalama notu düşer.
//
// DÜRÜST SINIR: bu script neyin kalıcı olduğuna KARAR VEREMEZ — o hâlâ model işi.
// Yaptığı tek şey mekanik: oturumun ne hakkında olduğunu (senin promptların) ve
// transcript yolunu kaydeder. Böylece unutulan şey sessizce kaybolmaz, bir sonraki
// oturumun brief'inde "işlenmemiş inbox" olarak GÖRÜNÜR ve küratörlük oraya kayar.
//
// Aynı session_id tekrar biterse (resume) dosyanın üzerine yazar — inbox şişmez.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { INBOX_DIR, readHookInput, workspaceForCwd, syncIndexes, redactSecrets, scanTranscript } from './lib.mjs';

const MIN_PROMPTS = 2; // tek soruluk oturumlar inbox'a girmez
const MAX_OPS = 12; // gövdede listelenecek komut sayısı

// scanTranscript lib.mjs'te duruyor: nudge.mjs (Stop hook) AYNI cevaba ihtiyaç duyuyor ve
// iki kopya tutmak, bu sistemin tekrar tekrar kırıldığı desenin kendisi olurdu.
// Testler: bin/tests/nudge.test.mjs — Bash-heredoc ile yazılan notun görülmesi dahil.


// Frontmatter tek satır olmak ZORUNDA — lib.mjs'in parser'ı katlanmış YAML'ı kırpar.
// Redaksiyon burada: inbox'a giden HER metin (prompt, komut, yol) tek kapıdan geçsin.
const oneLine = (s, max) => {
  const t = redactSecrets(s).replace(/\s+/g, ' ').replace(/"/g, "'").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
};

// Değer JSON.stringify ile kaçırılmak ZORUNDA. Komutlar ters bölü ve tırnak taşıyor
// (`--filter a\,b`); elle `"..."` sarılırsa lib.mjs'in parser'ı JSON.parse'ta düşüp
// naif kırpmaya geriler ve alan bozuk okunur. codex-capture.mjs ile aynı sözleşme.
const quoted = (s, max) => JSON.stringify(oneLine(s, max));

const main = async () => {
  const input = await readHookInput();

  // ASIL GARANTİ: indeks, bir sonraki oturum onu YÜKLEMEDEN önce mutlaka güncel olsun.
  // PostToolUse hook'u bunu zaten yazma anında yapıyor; buradaki tekrar, o hook'un
  // kaçırdığı her yolu (Obsidian'dan elle düzenleme, başka araçla yazma, hook hatası) kapatır.
  try { syncIndexes(); } catch { /* indeks eşitlenemese bile yakalama devam etsin */ }

  // Hook GLOBAL settings.json'da, makinedeki her projede ateşlenir. Sadece bilinen
  // üç iş alanı yakalanır; tanımsız klasörler (geçici dizinler, başkasının repoları) atlanır.
  const ws = workspaceForCwd(input.cwd || '');
  if (!ws) return;

  const { prompts, files, notes, ops } = scanTranscript(input.transcript_path, input.cwd);
  if (prompts.length < MIN_PROMPTS) return;

  mkdirSync(join(INBOX_DIR, ws), { recursive: true });
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const sid = (input.session_id || 'nosid').slice(0, 8);
  const file = join(INBOX_DIR, ws, `${day}-${sid}.md`);

  // `topic` / `touched` / `notes` alanlarını brief.mjs oturum açılışında OKUR ve
  // "son oturum" özeti olarak context'e basar — "nerede kalmıştık" cevabı buradan gelir.
  // Bu yüzden hepsi TEK SATIR ve kısa olmak zorunda.
  const body = [
    '---',
    `date: ${day}`,
    `project: ${basename(input.cwd || '')}`,
    `ended: ${now.toISOString()}`,
    `topic: ${quoted(prompts[0] || '', 150)}`,
    `touched: ${quoted(files.slice(0, 6).join(', '), 200)}`,
    `ops: ${quoted(ops.slice(0, 6).join(', '), 200)}`,
    `notes: ${quoted(notes.join(', '), 150)}`,
    `session_id: ${input.session_id || ''}`,
    `transcript: ${input.transcript_path || ''}`,
    `end_reason: ${input.reason || ''}`,
    'status: unprocessed',
    '---',
    `# Oturum ${day} · ${basename(input.cwd || '?')}`,
    '',
    `Bitiş: ${now.toISOString()} (${input.reason || 'other'}) · ${prompts.length} prompt`,
    '',
    '## Ne konuşuldu (kullanıcı promptları)',
    ...prompts.map((p) => `- ${p.replace(/\n+/g, ' ')}`),
    '',
    ...(files.length ? ['## Dokunulan dosyalar', ...files.map((f) => `- \`${f}\``), ''] : []),
    ...(ops.length ? [
      '## Çalıştırılan ops komutları',
      ...ops.slice(0, MAX_OPS).map((o) => `- \`${oneLine(o, 300)}\``),
      ...(ops.length > MAX_OPS ? [`- …+${ops.length - MAX_OPS} komut daha`] : []),
      '',
    ] : []),
    ...(notes.length ? ['## Yazılan memory notları', ...notes.map((n) => `- [[${n}]]`), ''] : []),
    '## Küratörlük',
    '- [ ] Kalıcı bir şey var mı? Varsa memory notuna işle, sonra bu dosyayı sil.',
    '',
    `Tam transcript: \`${input.transcript_path || '—'}\``,
    '',
  ].join('\n');

  writeFileSync(file, body);
};

main().catch(() => {}).finally(() => process.exit(0));
