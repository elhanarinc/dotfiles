// Inbox küratörü — launchd ile günde bir çalışır, inbox'ı insansız işler.
//
// NEDEN VAR: 2026-08-12'de "terfi insan onayında kalsın" denip küratörlük sahipsiz bırakıldı;
// iki ayda inbox 174 kayda şişti. Kullanıcı 2026-10-09'da kararı tersine çevirdi: "sürekli
// birikmesin, sistem kendi kendine yönetsin". Onay kapısı yerine DENETİM İZİ var:
// curator-log.md (ne yazıldı, neden), brief'teki küratör satırı, git geçmişi (geri alma).
//
// Akış:
//   1. Deterministik süpürme (model yok): `notes:` alanındaki not vault'ta varsa kayıt
//      işlenmiş sayılır; işlenmiş kayıt KEEP_DAYS sonra silinir.
//   2. Yargı turu: kalan kayıtların transcript'inden özet (yalnız prompt + asistan metni +
//      araç çağrısı başlıkları; araç ÇIKTISI yok, secret redakte) → `claude -p` başsız oturum,
//      cwd = VAULT. cwd hiçbir iş alanı kökünün altında olmadığı için brief/nudge/capture
//      hook'ları kapsam dışı kalıp SUSAR (özyineleme yok: küratörün kendi oturumu inbox'a
//      düşmez, nudge exit 2 ile -p oturumunu döngüye sokmaz).
//   3. reindex + curator-status.json + git commit/push (kullanıcı 2026-10-09'da onayladı,
//      YALNIZ brain reposu için).
//
// Kayıt SİLİNMEZ, `status: curated` olur: brief "nerede kalmıştık" için en yeni kaydı
// okuyor. mtime korunur (brief sıralaması mtime'a bakıyor).
//
//   node curate.mjs              → tam çalıştırma
//   node curate.mjs --dry-run    → hiçbir şey yazma, planı göster
//   node curate.mjs --no-git     → commit/push yok
//   node curate.mjs --limit 10   → bu çalıştırmada en fazla 10 kayıt modele gider
//   node curate.mjs --install    → launchd ajanını kur/yenile
//
// Test kancası: BRAIN_CURATOR_CLAUDE=<komut> verilirse `claude` yerine o çalışır.
import {
  existsSync, readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, rmSync,
  appendFileSync, utimesSync, unlinkSync,
} from 'node:fs';
import { join, basename, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { VAULT, INBOX_DIR, WORKSPACES, parseFrontmatter, redactSecrets } from './lib.mjs';

export const STATE_DIR = join(VAULT, 'bin', 'state');
export const LOG_PATH = join(STATE_DIR, 'curator-log.md');
export const STATUS_PATH = join(STATE_DIR, 'curator-status.json');
const LOCK_PATH = join(STATE_DIR, 'curator.lock');
const DIGEST_DIR = join(STATE_DIR, 'curator-tmp');
const LABEL = 'com.brain.curator';

export const MIN_AGE_MS = 6 * 3600e3;      // oturum yeni bittiyse dokunma (resume olabilir)
export const KEEP_DAYS = 14;              // işlenmiş kayıt bu kadar gün "nerede kalmıştık" için durur
const BATCH = 8;
const DEFAULT_LIMIT = 40;
const DIGEST_MAX = 30000;
const BATCH_TIMEOUT_MS = 20 * 60e3;

// ---------- kayıt okuma ----------

export function listRecords(inboxDir = INBOX_DIR, workspaces = WORKSPACES) {
  const out = [];
  for (const ws of workspaces) {
    const dir = join(inboxDir, ws);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.md')) continue;
      const path = join(dir, f);
      const text = readFileSync(path, 'utf8');
      const fm = parseFrontmatter(text);
      const ended = Date.parse(fm.ended || '') || statSync(path).mtimeMs;
      out.push({ ws, file: f, path, fm, text, ended });
    }
  }
  return out.sort((a, b) => a.ended - b.ended);
}

export const noteList = (fm) => String(fm.notes || '')
  .split(',').map((s) => s.trim()).filter((s) => s && !s.startsWith('zz_'));

export function existingNoteNames(vault = VAULT, workspaces = WORKSPACES) {
  const names = new Set();
  const walk = (d) => {
    if (!existsSync(d)) return;
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(d, e.name));
      else if (e.name.endsWith('.md')) names.add(e.name.slice(0, -3));
    }
  };
  for (const ws of [...workspaces, 'archive']) walk(join(vault, ws));
  return names;
}

// ---------- frontmatter durum güncellemesi (mtime korunur) ----------

export function markCurated(rec, { by, notes = [], now = new Date() }) {
  const st = statSync(rec.path);
  const add = [
    `curated_at: ${now.toISOString()}`,
    `curated_by: ${by}`,
    `curated_notes: "${notes.join(', ')}"`,
  ];
  let text = rec.text
    .replace(/^status: .*$/m, 'status: curated')
    .replace(/^curated_(at|by|notes): .*\n/gm, '');
  if (!/^status: /m.test(text)) text = text.replace(/^---\n/, '---\nstatus: curated\n');
  text = text.replace(/^(status: curated)$/m, `$1\n${add.join('\n')}`);
  writeFileSync(rec.path, text);
  utimesSync(rec.path, st.atime, st.mtime);
  rec.text = text;
  rec.fm = parseFrontmatter(text);
}

// ---------- 1. deterministik süpürme ----------

export function sweep(records, { names, now = Date.now(), dryRun = false } = {}) {
  const res = { closed: [], deleted: [] };
  for (const rec of records) {
    if (rec.fm.status === 'curated') {
      const at = Date.parse(rec.fm.curated_at || '') || rec.ended;
      if (now - Math.max(at, rec.ended) > KEEP_DAYS * 864e5) {
        if (!dryRun) unlinkSync(rec.path);
        res.deleted.push(rec);
      }
      continue;
    }
    const written = noteList(rec.fm).filter((n) => names.has(n));
    if (written.length) {
      if (!dryRun) markCurated(rec, { by: 'sweep', notes: written });
      res.closed.push(rec);
    }
  }
  return res;
}

export const pendingForModel = (records, now = Date.now()) => records.filter((r) =>
  r.fm.status !== 'curated' && now - r.ended >= MIN_AGE_MS);

// ---------- 2. transcript özeti ----------

const clip = (s, n) => (s.length > n ? `${s.slice(0, n)}…` : s);
const textOf = (content, types) => (typeof content === 'string' ? content
  : Array.isArray(content) ? content.filter((b) => types.includes(b?.type)).map((b) => b.text || '').join(' ') : '');

// Claude Code transcript'i: user/assistant olayları. Araç çıktısı (tool_result) BİLEREK yok —
// hem en büyük hacim hem en olası secret kaynağı.
export function condenseClaude(body) {
  const out = [];
  for (const line of body.split('\n')) {
    if (!line.trim()) continue;
    let ev; try { ev = JSON.parse(line); } catch { continue; }
    const c = ev.message?.content;
    if (ev.type === 'user' && !ev.isMeta) {
      if (Array.isArray(c) && c.some((b) => b?.type === 'tool_result')) continue;
      const t = textOf(c, ['text']).trim();
      if (t && !t.startsWith('<')) out.push(`KULLANICI: ${clip(t, 2000)}`);
    } else if (ev.type === 'assistant' && Array.isArray(c)) {
      for (const b of c) {
        if (b?.type === 'text' && b.text?.trim()) out.push(`ASİSTAN: ${clip(b.text.trim(), 1500)}`);
        else if (b?.type === 'tool_use') {
          const arg = b.input?.command || b.input?.file_path || b.input?.description || '';
          out.push(`[araç ${b.name}] ${clip(String(arg).replace(/\s+/g, ' '), 200)}`);
        }
      }
    }
  }
  return out;
}

// Codex rollout'u: response_item olayları. AGENTS.md/environment enjeksiyonu atlanır.
export function condenseCodex(body) {
  const out = [];
  for (const line of body.split('\n')) {
    if (!line.trim()) continue;
    let ev; try { ev = JSON.parse(line); } catch { continue; }
    if (ev.type !== 'response_item') continue;
    const it = ev.payload || {};
    if (it.type === 'message' && (it.role === 'user' || it.role === 'assistant')) {
      const t = textOf(it.content, ['input_text', 'output_text', 'text']).trim();
      if (!t || t.startsWith('<') || t.startsWith('# AGENTS.md')) continue;
      out.push(`${it.role === 'user' ? 'KULLANICI' : 'ASİSTAN'}: ${clip(t, it.role === 'user' ? 2000 : 1500)}`);
    } else if (it.type === 'function_call' || it.type === 'custom_tool_call') {
      out.push(`[araç ${it.name}] ${clip(String(it.arguments ?? it.input ?? '').replace(/\s+/g, ' '), 200)}`);
    }
  }
  return out;
}

// Baş + son: kararlar çoğu zaman oturumun sonunda oturur, bağlam başta.
export function fitDigest(lines, max = DIGEST_MAX) {
  const full = lines.join('\n');
  if (full.length <= max) return full;
  const head = Math.floor(max * 0.3);
  return `${full.slice(0, head)}\n\n… (orta kısım kırpıldı) …\n\n${full.slice(full.length - (max - head))}`;
}

export function buildDigest(rec) {
  const src = rec.fm.transcript || rec.fm.rollout || '';
  let lines = [];
  if (src && existsSync(src)) {
    const body = readFileSync(src, 'utf8');
    lines = rec.fm.rollout ? condenseCodex(body) : condenseClaude(body);
  }
  const head = [
    `# Kayıt: ${rec.ws}/${rec.file}`,
    `İş alanı: ${rec.ws} · proje/leaf: ${rec.fm.project || '?'} · tarih: ${rec.fm.date || '?'}`,
    `Oturumda zaten yazılan notlar: ${rec.fm.notes || '(yok)'}`,
    '',
  ];
  const body = lines.length ? fitDigest(lines)
    : `(transcript artık yok — yalnız inbox kaydı)\n\n${rec.text}`;
  return redactSecrets(`${head.join('\n')}${body}\n`);
}

// ---------- model turu ----------

export function leafFor(rec, vault = VAULT) {
  const p = rec.fm.project && join(vault, rec.ws, rec.fm.project);
  return p && existsSync(p) ? `${rec.ws}/${rec.fm.project}` : `${rec.ws}/_kok`;
}

export function buildPrompt(items) {
  return `Sen ~/Obsidian/brain hafıza vault'unun küratörüsün (cwd = vault kökü). Aşağıdaki her
oturum özetini oku ve SONRAKİ oturumlarda işe yarayacak KALICI bilgi var mı karar ver.

Kalıcı sayılır: kullanıcının verdiği kararlar ve gerekçeleri, ölçülmüş sonuçlar/sayılar,
"bunu bir daha yapma / böyle yap" türü düzeltmeler, proje durumu değişiklikleri (deploy edildi,
kapatıldı, reddedildi), dış kaynak/hesap/yol referansları.
Kalıcı SAYILMAZ: tek seferlik soru-cevap, kod ayrıntısı (repo/git zaten tutuyor), sohbet,
geçici hata ayıklama adımları, oturumda zaten not edilmiş bilgi. Çoğu oturumdan HİÇBİR ŞEY
çıkmaması normaldir — emin değilsen yazma.

Her aday için:
1. ÖNCE ara: \`node bin/scripts/search.mjs --all "<konu>"\`. İlgili not varsa YENİ NOT AÇMA,
   o notu Edit ile güncelle (gövdeye tarihli kısa bölüm; index_hook artık yanlışsa onu da düzelt).
2. Yeni not gerekiyorsa verilen leaf klasörüne \`<snake_case_slug>.md\` olarak Write ile yaz:
   ---
   name: <slug>
   description: "<tek satır>"
   index_title: "<kısa başlık>"
   index_hook: "<≤150 karakter, en önemli bilgi>"
   metadata:
     type: <user|feedback|project|reference>
   ---
   Gövde: bilgi; feedback/project için **Why:** ve **How to apply:** satırları. Mutlak tarih kullan.
3. ASLA: MEMORY.md'yi düzenleme (üretiliyor), inbox dosyalarına dokunma, secret/şifre/token yazma,
   vault dışına yazma, kullanıcıya soru sorma.

Oturumlar (özet dosyası → yeni not için leaf):
${items.map((it) => `- ${it.record} · özet: ${it.digest} · leaf: ${it.leaf}`).join('\n')}

Bitince YALNIZ şu JSON'u yaz (başka metin yok), her kayıt için bir eleman:
{"results":[{"record":"<kayıt adı aynen>","action":"written|updated|none","notes":["<slug>"],"why":"<≤120 karakter>"}]}`;
}

export function parseResults(text) {
  const s = String(text || '');
  const start = s.indexOf('{"results"') >= 0 ? s.indexOf('{"results"') : s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const j = JSON.parse(s.slice(start, end + 1));
    return Array.isArray(j.results) ? j.results : null;
  } catch { return null; }
}

function runModel(prompt) {
  const custom = process.env.BRAIN_CURATOR_CLAUDE;
  const cmd = custom || 'claude';
  const args = custom ? [] : [
    '-p', '--output-format', 'json',
    '--permission-mode', 'acceptEdits',
    '--allowedTools', `Read,Glob,Grep,Write,Edit,Bash(node bin/scripts/search.mjs:*),Bash(node ${VAULT}/bin/scripts/search.mjs:*)`,
    '--max-turns', '80',
  ];
  const r = spawnSync(cmd, args, {
    cwd: VAULT, input: prompt, encoding: 'utf8', timeout: BATCH_TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024, shell: Boolean(custom),
    env: { ...process.env, BRAIN_CURATOR: '1' },
  });
  if (r.error) throw new Error(`model çalışmadı: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`model exit ${r.status}: ${clip((r.stderr || r.stdout || '').trim(), 300)}`);
  let text = r.stdout;
  try { const j = JSON.parse(r.stdout); if (typeof j.result === 'string') text = j.result; } catch { /* düz metin */ }
  return text;
}

// ---------- yardımcılar ----------

const git = (...args) => spawnSync('git', args, { cwd: VAULT, encoding: 'utf8' });

function acquireLock() {
  if (existsSync(LOCK_PATH) && Date.now() - statSync(LOCK_PATH).mtimeMs < 2 * 3600e3) return false;
  writeFileSync(LOCK_PATH, String(process.pid));
  return true;
}

const logLine = (s) => {
  if (!existsSync(LOG_PATH)) writeFileSync(LOG_PATH, '# Küratör günlüğü\n\nOtomatik küratörün her kararı. Yanlış bir not → `git log -- <not>` ile bul, geri al.\n\n');
  appendFileSync(LOG_PATH, `${s}\n`);
};

function install() {
  const plist = join(process.env.HOME, 'Library', 'LaunchAgents', `${LABEL}.plist`);
  const node = process.execPath;
  const path = [join(process.env.HOME, '.local', 'bin'), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin'].join(':');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array><string>${node}</string><string>${fileURLToPath(import.meta.url)}</string></array>
  <key>WorkingDirectory</key><string>${VAULT}</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>${path}</string></dict>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>12</integer><key>Minute</key><integer>30</integer></dict>
  <key>StandardOutPath</key><string>${join(STATE_DIR, 'curator.out.log')}</string>
  <key>StandardErrorPath</key><string>${join(STATE_DIR, 'curator.out.log')}</string>
  <key>ProcessType</key><string>Background</string>
</dict>
</plist>
`;
  mkdirSync(join(process.env.HOME, 'Library', 'LaunchAgents'), { recursive: true });
  writeFileSync(plist, xml);
  const uid = process.getuid();
  spawnSync('launchctl', ['bootout', `gui/${uid}/${LABEL}`]);
  const r = spawnSync('launchctl', ['bootstrap', `gui/${uid}`, plist], { encoding: 'utf8' });
  console.log(r.status === 0 ? `kuruldu: ${plist} (her gün 12:30, uykudaysa uyanınca)` : `bootstrap hatası: ${r.stderr}`);
}

// ---------- ana akış ----------

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--install')) return install();
  const dryRun = argv.includes('--dry-run');
  const noGit = argv.includes('--no-git');
  const li = argv.indexOf('--limit');
  const limit = li >= 0 ? Number(argv[li + 1]) || DEFAULT_LIMIT : DEFAULT_LIMIT;

  if (!dryRun && !acquireLock()) { console.log('başka bir küratör çalışıyor, çıkılıyor'); return; }
  const status = { last_run: new Date().toISOString(), ok: false, swept: 0, deleted: 0, curated: 0, written: [], pending_left: 0, error: null };
  try {
    const day = status.last_run.slice(0, 10);
    const sw = sweep(listRecords(), { names: existingNoteNames(), dryRun });
    status.swept = sw.closed.length;
    status.deleted = sw.deleted.length;

    const pending = pendingForModel(listRecords());
    const todo = pending.slice(0, limit);
    console.log(`süpürme: ${sw.closed.length} kapandı, ${sw.deleted.length} silindi · modele: ${todo.length}/${pending.length}`);
    if (dryRun) { todo.forEach((r) => console.log(`  ${r.ws}/${r.file} → ${leafFor(r)}`)); return; }
    if (!dryRun) for (const r of sw.closed) logLine(`- ${day} · ${r.ws}/${r.file} → süpürme: oturumda yazılmış (${noteList(r.fm).join(', ')})`);

    rmSync(DIGEST_DIR, { recursive: true, force: true });
    mkdirSync(DIGEST_DIR, { recursive: true });
    for (let i = 0; i < todo.length; i += BATCH) {
      const batch = todo.slice(i, i + BATCH);
      const items = batch.map((rec, k) => {
        const digest = join(DIGEST_DIR, `${i + k}-${rec.file}`);
        writeFileSync(digest, buildDigest(rec));
        return { record: rec.file, digest: digest.slice(VAULT.length + 1), leaf: leafFor(rec), rec };
      });
      const results = parseResults(runModel(buildPrompt(items)));
      if (!results) throw new Error(`model JSON döndürmedi (parti ${i / BATCH + 1})`);
      for (const it of items) {
        const res = results.find((x) => x.record === it.record);
        if (!res) continue; // cevapsız kayıt bir sonraki çalıştırmaya kalır
        const notes = (Array.isArray(res.notes) ? res.notes : []).map(String);
        markCurated(it.rec, { by: `model:${res.action}`, notes });
        status.curated++;
        if (res.action !== 'none') status.written.push(...notes.map((n) => `${res.action === 'updated' ? '~' : '+'}${n}`));
        logLine(`- ${day} · ${it.rec.ws}/${it.record} → ${res.action}${notes.length ? `: ${notes.join(', ')}` : ''} — ${res.why || ''}`);
      }
    }
    rmSync(DIGEST_DIR, { recursive: true, force: true });
    spawnSync(process.execPath, [join(VAULT, 'bin', 'scripts', 'reindex.mjs')], { cwd: VAULT });
    status.pending_left = pendingForModel(listRecords()).length;
    status.ok = true;
  } catch (e) {
    status.error = String(e.message || e);
    console.error(status.error);
  } finally {
    if (!dryRun) {
      writeFileSync(STATUS_PATH, `${JSON.stringify(status, null, 2)}\n`);
      if (!noGit) {
        git('add', '-A');
        if (git('diff', '--cached', '--quiet').status !== 0) {
          git('commit', '-q', '-m', `küratör: ${status.curated} kayıt işlendi, ${status.written.length} not (${status.swept} süpürme)`);
        }
        const pull = git('pull', '-q', '--rebase', '--autostash');
        const push = pull.status === 0 ? git('push', '-q') : pull;
        if (push.status !== 0) {
          status.error = `${status.error ? `${status.error} · ` : ''}git: ${clip((push.stderr || '').trim(), 200)}`;
          writeFileSync(STATUS_PATH, `${JSON.stringify(status, null, 2)}\n`);
        }
      }
      rmSync(LOCK_PATH, { force: true });
    }
  }
  console.log(JSON.stringify(status));
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) main();
