// SessionEnd hook. Oturum biterken inbox'a ham bir yakalama notu düşer.
//
// DÜRÜST SINIR: bu script neyin kalıcı olduğuna KARAR VEREMEZ — o hâlâ model işi.
// Yaptığı tek şey mekanik: oturumun ne hakkında olduğunu (senin promptların) ve
// transcript yolunu kaydeder. Böylece unutulan şey sessizce kaybolmaz, bir sonraki
// oturumun brief'inde "işlenmemiş inbox" olarak GÖRÜNÜR ve küratörlük oraya kayar.
//
// Aynı session_id tekrar biterse (resume) dosyanın üzerine yazar — inbox şişmez.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { INBOX_DIR, VAULT, readHookInput, workspaceForCwd, syncIndexes } from './lib.mjs';

const MIN_PROMPTS = 2; // tek soruluk oturumlar inbox'a girmez

const EDIT_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

// Transcript'i TEK geçişte tarar: promptlar + yazılan dosyalar + yazılan memory notları.
// "Nerede kalmıştık" sorusunu cevaplayabilmek için promptlar YETMİYOR (onlar ne SORDUĞUNU
// söyler, nerede KALDIĞINI söylemez) — hangi dosyalara dokunulduğu asıl sinyal.
const scanTranscript = (transcriptPath, cwd) => {
  const out = { prompts: [], files: [], notes: [] };
  if (!transcriptPath || !existsSync(transcriptPath)) return out;
  const seenFile = new Set();

  for (const line of readFileSync(transcriptPath, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let ev;
    try { ev = JSON.parse(line); } catch { continue; }
    const content = ev.message?.content;

    // --- asistanın yazma çağrıları ---
    if (ev.type === 'assistant' && Array.isArray(content)) {
      for (const b of content) {
        if (b?.type !== 'tool_use' || !EDIT_TOOLS.has(b.name)) continue;
        const p = b.input?.file_path;
        if (typeof p !== 'string' || seenFile.has(p)) continue;
        seenFile.add(p);
        if (p.includes('/memory/') || p.startsWith(`${VAULT}/`)) {
          const n = basename(p).replace(/\.md$/, '');
          if (n !== 'MEMORY' && !out.notes.includes(n)) out.notes.push(n);
        } else {
          out.files.push(cwd && p.startsWith(`${cwd}/`) ? p.slice(cwd.length + 1) : basename(p));
        }
      }
      continue;
    }

    // --- kullanıcı promptları ---
    if (ev.type !== 'user' || ev.isMeta) continue;
    let text = '';
    if (typeof content === 'string') text = content;
    else if (Array.isArray(content)) {
      if (content.some((b) => b.type === 'tool_result')) continue; // araç çıktısı, prompt değil
      text = content.filter((b) => b.type === 'text').map((b) => b.text).join(' ');
    }
    text = text.trim();
    if (!text || text.startsWith('<')) continue; // system-reminder vb.
    out.prompts.push(text.length > 300 ? `${text.slice(0, 300)}…` : text);
  }
  return out;
};

// Frontmatter tek satır olmak ZORUNDA — lib.mjs'in parser'ı katlanmış YAML'ı kırpar.
const oneLine = (s, max) => {
  const t = String(s).replace(/\s+/g, ' ').replace(/"/g, "'").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
};

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

  const { prompts, files, notes } = scanTranscript(input.transcript_path, input.cwd);
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
    `topic: "${oneLine(prompts[0] || '', 150)}"`,
    `touched: "${oneLine(files.slice(0, 6).join(', '), 200)}"`,
    `notes: "${oneLine(notes.join(', '), 150)}"`,
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
