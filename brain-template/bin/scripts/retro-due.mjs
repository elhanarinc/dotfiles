// Retro VADESİ — yalnız tarih/sayım kontrolü ve TEK bir görev satırı. Semantik iş burada DEĞİL.
//
// NEDEN BÖYLE: kullanıcı 2026-09-16'da "mantıklı ama ben bunu hatırlamam ki yap et diye" dedi.
// İki kayıtlı red bu tasarımı belirledi:
//   - [[brain_capture_curation_gap]] (2026-08-12): oturum başına arka plan model turu İSTENMEDİ.
//     → burada model turu YOK, sadece iki tarih karşılaştırması.
//   - [[brain_self_healing_layer_2026_09_15]]: BİLDİRİM katmanı ölçüldü ve çalışmıyor
//     (3 ayda 27 ölü link + 37 borç birikti). → burada yeni bildirim kanalı YOK; çıktı
//     zaten yük taşıyan görev panosuna (`bin/state/tasks/<ws>.md`) tek satır olarak giriyor,
//     ve o satırlar her oturum başında context'e otomatik düşüyor.
//
// Sınır: bu dosya ASLA skill/not yazmaz. Retro'nun kendisi (transcript okuma, tekrar eden
// düzeltmeleri bulma, diff önerme) `~/.claude/skills/brain-retro` içinde, oturum içinde,
// kullanıcı onayıyla yürür. Ayrı dosya olmasının sebebi bu sınırın görünür kalması.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { VAULT, TASK_DIR, WS_ROOTS } from './lib.mjs';

export const RETRO_DIR = join(VAULT, 'bin', 'state', 'retro');
// 14 gün. ÜST SINIR ~25 GÜN: transcript'ler `cleanupPeriodDays` ayarlı olmadığı için 30 günde
// siliniyor — daha uzun bir kadans retro'nun girdisini SESSİZCE kaybettirir.
export const CADENCE_DAYS = 14;
// Boş gürültü olmasın: son retro'dan bu yana en az bu kadar yeni oturum transcript'i olmalı.
export const MIN_SESSIONS = 5;
// Satırı tekilleştiren şey metin değil BU işaretçi — metin değişse bile kopya üretmesin.
export const MARKER = '<!-- retro-due -->';

const statePath = (ws) => join(RETRO_DIR, `${ws}.json`);

export const lastRun = (ws) => {
  try { return new Date(JSON.parse(readFileSync(statePath(ws), 'utf8')).lastRun); }
  catch { return null; }
};

// Harness proje klasörü adı = cwd'nin `/` yerine `-` konmuş hâli. İŞ ALANI FİLTRESİ BURADA:
// filtresiz sayarsak personal'daki yoğunluk appsm'in panosuna görev düşürür (2026-09-16'da
// tam olarak bu oldu ve yakalandı). En UZUN eşleşen kök kazanır — kökler iç içe olabilir.
export const wsForProjectDir = (name) => {
  let best = null;
  for (const [root, ws] of WS_ROOTS) {
    const slug = root.replace(/\//g, '-');
    if ((name === slug || name.startsWith(`${slug}-`)) && (!best || slug.length > best.len)) {
      best = { ws, len: slug.length };
    }
  }
  return best?.ws || null;
};

// Son retro'dan beri dokunulmuş transcript sayısı — YALNIZ verilen iş alanınınkiler.
// Retro'nun GİRDİSİ bu, o yüzden eşik de bunun üstünde: girdi yoksa görev satırı basmak
// tam olarak çürüyen bildirim katmanını geri getirir.
export const sessionsSince = (since, ws = null, root = join(process.env.HOME, '.claude', 'projects')) => {
  let n = 0;
  try {
    for (const d of readdirSync(root, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      if (ws && wsForProjectDir(d.name) !== ws) continue;
      let files = [];
      try { files = readdirSync(join(root, d.name)); } catch { continue; }
      for (const f of files) {
        if (!f.endsWith('.jsonl')) continue;
        try { if (statSync(join(root, d.name, f)).mtimeMs > since.getTime()) n++; } catch { /* yok say */ }
      }
    }
  } catch { return 0; }
  return n;
};

// İlk kurulumda lastRun YOK → vadesi gelmiş sayılır ama yine de oturum eşiği aranır.
export const isDue = (ws, now = new Date(), opts = {}) => {
  const last = opts.last !== undefined ? opts.last : lastRun(ws);
  const since = last || new Date(now.getTime() - CADENCE_DAYS * 864e5);
  if (last && now.getTime() - last.getTime() < CADENCE_DAYS * 864e5) return false;
  const n = opts.sessions !== undefined ? opts.sessions : sessionsSince(since, ws);
  return n >= MIN_SESSIONS;
};

export const taskFileFor = (ws) => {
  const c = [ws && join(TASK_DIR, `${ws}.md`), join(TASK_DIR, 'genel.md')].filter(Boolean);
  return c.find(existsSync) || null;
};

const line = (ws, now) =>
  `- [ ] **brain retro vadesi geldi** (son çalıştırma: ${lastRun(ws) ? lastRun(ws).toISOString().slice(0, 10) : 'hiç'}`
  + `, işaretlendi ${now.toISOString().slice(0, 10)}). \`/brain-retro\` çalıştır: son ${CADENCE_DAYS} günün`
  + ` transcript'lerinde TEKRAR EDEN düzeltmelerimi bul, \`~/.claude/skills/*\` veya brain feedback`
  + ` notlarına somut diff öner. Yazma onaydan ÖNCE yapılmaz. ${MARKER}`;

// Vadesi geldiyse görev panosuna TEK satır ekler. Dönen değer: eklendi mi (bool).
// Idempotent: işaretçi dosyada zaten varsa (işaretli ya da değil) hiçbir şey yapmaz.
export const ensureRetroTask = (ws, now = new Date()) => {
  if (!ws) return false;
  const file = taskFileFor(ws);
  if (!file) return false;
  const body = readFileSync(file, 'utf8');
  if (body.includes(MARKER)) return false;
  if (!isDue(ws, now)) return false;
  writeFileSync(file, `${body.replace(/\s*$/, '')}\n${line(ws, now)}\n`);
  return true;
};

// Retro YAPILDIKTAN sonra çağrılır: damgayı atar VE görev satırını kapatır.
// İkisi aynı çağrıda — damga atılıp satır kapanmazsa kullanıcı aynı görevi iki kez görür,
// ki bu tam olarak katmanın çürüme sinyali.
export const stampRetro = (ws, now = new Date()) => {
  mkdirSync(RETRO_DIR, { recursive: true });
  writeFileSync(statePath(ws), `${JSON.stringify({ lastRun: now.toISOString() }, null, 2)}\n`);
  const file = taskFileFor(ws);
  if (file) {
    const body = readFileSync(file, 'utf8');
    if (body.includes(MARKER)) {
      writeFileSync(file, body.split('\n')
        .map((l) => (l.includes(MARKER) ? l.replace(/^(\s*-\s*)\[ \]/, '$1[x]') : l))
        .join('\n'));
    }
  }
  return statePath(ws);
};

// CLI: `retro-due.mjs --stamp <ws>` (skill bunu onay SONRASI çağırır) · `--check <ws>`
if (process.argv[1] && process.argv[1].endsWith('retro-due.mjs')) {
  const [flag, ws] = process.argv.slice(2);
  if (flag === '--stamp' && ws) console.log(`damgalandı: ${stampRetro(ws)}`);
  else if (flag === '--check' && ws) {
    const last = lastRun(ws);
    const since = last || new Date(Date.now() - CADENCE_DAYS * 864e5);
    console.log(JSON.stringify({
      ws, lastRun: last ? last.toISOString() : null,
      sessionsSince: sessionsSince(since, ws), due: isDue(ws), taskFile: taskFileFor(ws),
    }, null, 2));
  } else console.log('kullanım: retro-due.mjs --check <ws> | --stamp <ws>');
}
