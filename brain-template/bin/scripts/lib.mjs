import { readFileSync, readdirSync, statSync, lstatSync, readlinkSync, writeFileSync, appendFileSync, renameSync, existsSync, realpathSync } from 'node:fs';
import { join, dirname, basename, isAbsolute, resolve } from 'node:path';

export const VAULT = join(process.env.HOME, 'Obsidian', 'brain');
export const TASK_DIR = join(VAULT, 'bin', 'state', 'tasks');
export const INBOX_DIR = join(VAULT, 'bin', 'state', 'inbox');
export const ARCHIVE_DIR = join(VAULT, 'archive');

const scalar = (raw) => {
  const v = raw.trim();
  if (v.startsWith('"')) { try { return JSON.parse(v); } catch { /* fall through */ } }
  return v.replace(/^['"]|['"]$/g, '');
};

// Tolerant of both `type: x` at top level and the nested `metadata:\n  type: x` form.
export function parseFrontmatter(text) {
  if (!text.startsWith('---\n')) return {};
  const end = text.indexOf('\n---', 4);
  if (end === -1) return {};
  const fm = {};
  for (const line of text.slice(4, end).split('\n')) {
    const m = line.match(/^(\s*)([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!m) continue;
    const [, indent, key, value] = m;
    if (indent.length > 0 && !value.trim()) continue;
    if (value.trim()) fm[key] = scalar(value);
  }
  return fm;
}

// Vault'taki iş alanları. Her biri altında bir veya daha çok "leaf" memory klasörü var;
// her leaf, harness'ın bir proje dizinine symlink'li ve KENDİ MEMORY.md'sini taşır
// (harness yalnızca o klasörde çalışırken onu yükler).
//
// İSİMLER VE KÖKLER MAKİNEYE ÖZGÜ, bu yüzden kodda değil `bin/state/config.json` içinde
// duruyorlar: scriptlerin kendisi public bir dotfiles deposunda taşınıyor, işveren/proje
// adları oraya giremez. Dosya yoksa hiçbir şey çökmez ama HİÇBİR cwd eşleşmez — hook'lar
// sessizce hiçbir iş yapmaz. Yeni makinede ilk iş bu dosyayı doldurmaktır (bin/docs/README.md).
export const CONFIG_PATH = join(VAULT, 'bin', 'state', 'config.json');

const CONFIG = (() => {
  try { return JSON.parse(readFileSync(CONFIG_PATH, 'utf8')); } catch { return {}; }
})();

const expandHome = (p) => (p.startsWith('~/') ? join(process.env.HOME, p.slice(2)) : p);
const CONFIG_WS = Array.isArray(CONFIG.workspaces) ? CONFIG.workspaces : [];

export const WORKSPACES = CONFIG_WS.map((w) => w?.name).filter(Boolean);

// cwd -> iş alanı. Görev panosu bu isme göre seçilir (bin/state/tasks/<ws>.md).
// Kök tanımlanmamış iş alanları (ör. yalnız arşiv amaçlı olanlar) hiçbir cwd'ye düşmez.
export const WS_ROOTS = CONFIG_WS
  .filter((w) => w?.name && w?.root)
  .map((w) => [expandHome(w.root), w.name]);

export const workspaceForCwd = (cwd = '') =>
  WS_ROOTS.find(([root]) => cwd === root || cwd.startsWith(`${root}/`))?.[1] || null;

export function listLeafDirs() {
  const leaves = [];
  for (const ws of WORKSPACES) {
    const wsDir = join(VAULT, ws);
    let entries;
    try { entries = readdirSync(wsDir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const dir = join(wsDir, e.name);
      if (readdirSync(dir).some((f) => f.endsWith('.md') && f !== 'MEMORY.md')) {
        leaves.push({ dir, ws, label: e.name });
      }
    }
  }
  return leaves;
}

export function loadNotes(dir) {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md') && f !== 'MEMORY.md')
    .map((file) => {
      const path = join(dir, file);
      const text = readFileSync(path, 'utf8');
      const fm = parseFrontmatter(text);
      return {
        file,
        path,
        text,
        mtime: statSync(path).mtimeMs,
        name: fm.index_title || fm.name || file.replace(/\.md$/, ''),
        description: fm.description || '',
        hook: fm.index_hook || fm.description || '',
        type: fm.type || 'project',
        status: fm.status || 'active',
      };
    });
}

// Hook stdin'i okur. TIMEOUT ŞART: harness pipe'ı kapatmazsa `for await` sonsuza kadar
// bloklar ve her oturum açılışı asılır — global bir hook için mümkün olan en kötü hata.
export function readHookInput(ms = 300) {
  return new Promise((resolve) => {
    let data = '';
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      process.stdin.destroy();
      try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); }
    };
    const timer = setTimeout(finish, ms);
    timer.unref?.();
    process.stdin.on('data', (c) => { data += c; });
    process.stdin.on('end', finish);
    process.stdin.on('error', finish);
  });
}

// --- repo varlık denetimi ---------------------------------------------------
// Harness dizin adı, gerçek yoldaki alfanümerik olmayan HER karakteri '-' yapar
// ('/', '_', '.' hepsi '-' olur) — ada bakıp yol tahmin edilemez. Bu yüzden her
// seviyede diskteki gerçek klasör adları aynı şekilde normalize edilip eşleştirilir.
const norm = (s) => s.replace(/[^A-Za-z0-9]/g, '-');

export function resolveRealPath(harnessName) {
  const walk = (dir, rest) => {
    if (!rest || rest === '-') return dir;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return null; }
    for (const e of entries) {
      if (!e.isDirectory() && !e.isSymbolicLink()) continue;
      const n = norm(e.name);
      if (rest === `-${n}`) return join(dir, e.name);
      if (rest.startsWith(`-${n}-`)) {
        const r = walk(join(dir, e.name), rest.slice(n.length + 1));
        if (r) return r;
      }
    }
    return null;
  };
  return walk('/', harnessName);
}

export const PROJECTS_DIR = join(process.env.HOME, '.claude', 'projects');

// Vault'a symlink'li her harness memory klasörünü, gerçek repo yolu ve canlılığıyla döner.
export function auditLeaves() {
  const rows = [];
  for (const name of readdirSync(PROJECTS_DIR).sort()) {
    const memPath = join(PROJECTS_DIR, name, 'memory');
    let st;
    try { st = lstatSync(memPath); } catch { continue; }
    const vaultDir = st.isSymbolicLink() ? readlinkSync(memPath) : memPath;
    if (!vaultDir.startsWith(VAULT)) continue;
    let notes = [];
    try { notes = readdirSync(vaultDir).filter((f) => f.endsWith('.md') && f !== 'MEMORY.md'); } catch { /* kırık link */ }
    const realPath = resolveRealPath(name);
    rows.push({
      leaf: vaultDir.replace(`${VAULT}/`, ''),
      harnessDir: join(PROJECTS_DIR, name),
      memPath,
      vaultDir,
      realPath,
      exists: Boolean(realPath),
      notes: notes.length,
    });
  }
  return rows;
}

export function contextForCwd(cwd) {
  const ws = workspaceForCwd(cwd);
  if (!ws) return null;

  const match = auditLeaves()
    .filter((row) => row.realPath && row.leaf.startsWith(`${ws}/`) &&
      (cwd === row.realPath || cwd.startsWith(`${row.realPath}/`)))
    .sort((a, b) => b.realPath.length - a.realPath.length)[0];
  const leaf = match ? match.leaf.slice(ws.length + 1) : '_kok';

  return {
    ws,
    leaf,
    leafDir: join(VAULT, ws, leaf),
    taskFile: join(TASK_DIR, `${ws}.md`),
  };
}

export const TYPE_ORDER = ['user', 'feedback', 'project', 'reference'];

export function byType(notes) {
  const groups = new Map(TYPE_ORDER.map((t) => [t, []]));
  for (const n of notes) {
    if (!groups.has(n.type)) groups.set(n.type, []);
    groups.get(n.type).push(n);
  }
  for (const list of groups.values()) list.sort((a, b) => a.name.localeCompare(b.name));
  return groups;
}

// --- indeks üretimi ---------------------------------------------------------
// TEK KAYNAK. reindex.mjs (CLI), brief.mjs (SessionStart), capture.mjs (SessionEnd) ve
// reindex-hook.mjs (PostToolUse) hepsi buradan geçer; böylece "elle reindex çalıştırmayı
// unutmak" diye bir hata sınıfı kalmaz.
export const INDEX_LABEL = {
  user: 'Kim / tercihler',
  feedback: 'Çalışma şekli (feedback)',
  project: 'Projeler & kararlar',
  reference: 'Referanslar',
};

// --- indeks bütçesi (2026-09-16'da ÖLÇÜLDÜ, varsayım değil) ---------------
// Harness MEMORY.md'yi yüklerken bir tavan uyguluyor ve aşınca SATIRLARI SESSİZCE DÜŞÜRÜYOR
// ("6 of 125 lines were cut off, starting at line 120"). Kesim sondan, yani alfabetik olarak
// geç gelen işaretçiler HER oturumda kayboluyor — üstelik kaybı yalnız uyarı metni söylüyor.
// Ölçüm: uyarı 27.607 baytlık dosyaya "25.3KB (limit: 24.4KB)" dedi; bayt/1000 (27,6) ve
// bayt/1024 (27,0) tutmuyor, KARAKTER/1024 (25,5) tutuyor → harness BAYT değil KARAKTER
// sayıyor. Türkçe (ş/ğ/ü/ö/ç/İ) 2 bayt olduğu için bayt üzerinden sınırlamak %5-10 yanıltır.
// Tavan 24,4 KiB ≈ 24.986 karakter; 24.000'de duruyoruz (marj bilinçli).
export const INDEX_BUDGET_CHARS = 24000;
// Satır başı tavan. Kırpılan şey YALNIZ hook metni — link ve başlık asla bozulmaz, çünkü
// kaybolmaması gereken şey işaretçinin KENDİSİ. Kırpılmış hook > düşmüş satır.
// SABİT tavan ölçeklenmiyor: 150 notta 180 yetiyor, 180 notta yetmez. Bu yüzden tavan
// UYARLANABİLİR — dosya bütçeye sığana kadar daraltılıyor. Tabanın altına inersek sığdırma
// artık mekanik olarak çözülemez demektir; o noktada doğru düzeltme not ARŞİVLEMEK, yani
// semantik iş → verify sesli düşer, kod sessizce daha fazla bilgi kırpmaz.
export const INDEX_LINE_MAX = 180;
export const INDEX_LINE_FLOOR = 110;

// Hook'u satır tavanına sığdırır. Kelime sınırından keser, sonuna '…' koyar.
export function fitIndexHook(prefix, hook, max = INDEX_LINE_MAX) {
  const room = max - prefix.length - 1;
  if (room <= 0) return '';
  if (hook.length <= room) return hook;
  const cut = hook.slice(0, room - 1);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > room * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:.\-–—]+$/, '')}…`;
}

const INDEX_HEADER = [
  '<!-- GENERATED by ~/Obsidian/brain/bin/scripts/reindex.mjs — elle düzenleme.',
  '     Bir satırı değiştirmek için notun frontmatter\'ındaki `index_title:` / `index_hook:` alanını düzenle. -->',
  '',
];

// Verilen satır tavanıyla indeks metnini üretir (saf, diske dokunmaz).
const renderIndex = (notes, max) => {
  const lines = [...INDEX_HEADER];
  for (const [type, list] of byType(notes)) {
    if (!list.length) continue;
    lines.push(`## ${INDEX_LABEL[type] || type}`, '');
    for (const n of list) {
      const prefix = `- [${n.name}](${n.file}) — `;
      const hook = fitIndexHook(prefix, (n.hook || '').replace(/\s+/g, ' ').trim(), max);
      lines.push(hook ? `${prefix}${hook}` : prefix.replace(/ — $/, ''));
    }
    lines.push('');
  }
  return lines.join('\n');
};

// Bir leaf klasörün MEMORY.md içeriğini frontmatter'dan üretir. Diske dokunmaz.
// Bütçeye sığmıyorsa satır tavanını 10'ar daraltır; tabana rağmen sığmıyorsa EN DAR hâlini
// döner ve `overBudget` işaretler — kaybı gizlemek yerine verify'ın görmesi için.
export function buildIndex(dir) {
  const notes = loadNotes(dir).filter((n) => n.status !== 'archived');
  if (!notes.length) return null;
  let max = INDEX_LINE_MAX;
  let text = renderIndex(notes, max);
  while (text.length > INDEX_BUDGET_CHARS && max > INDEX_LINE_FLOOR) {
    max -= 10;
    text = renderIndex(notes, max);
  }
  return { text, notes, lineMax: max, overBudget: text.length > INDEX_BUDGET_CHARS };
}

// Yarım yazılmış MEMORY.md diye bir şey olmasın: aynı anda iki oturum yazarsa bile
// okuyan taraf ya eski ya yeni dosyanın TAMAMINI görür.
function atomicWrite(path, text) {
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}

// Diskteki indeksleri notlarla eşitler.
//   check: true  → hiçbir şey yazmaz, sadece bayat olanları döner (doğrulama için)
//   only: [dir]  → sadece bu leaf klasörleri
// Dönen: { stale, changed, added } — added = indekse YENİ giren satırlar (leaf bazında).
export function syncIndexes({ only = null, check = false } = {}) {
  const stale = [];
  const added = [];
  for (const leaf of listLeafDirs()) {
    if (only && !only.includes(leaf.dir)) continue;
    let built;
    try { built = buildIndex(leaf.dir); } catch { continue; }
    if (!built) continue;
    const idx = join(leaf.dir, 'MEMORY.md');
    const current = existsSync(idx) ? readFileSync(idx, 'utf8') : null;
    if (current === built.text) continue;

    const oldLines = new Set((current || '').split('\n').filter((l) => l.startsWith('- [')));
    for (const l of built.text.split('\n')) {
      if (l.startsWith('- [') && !oldLines.has(l)) added.push({ ws: leaf.ws, label: leaf.label, line: l });
    }
    stale.push(`${leaf.ws}/${leaf.label}`);
    if (!check) atomicWrite(idx, built.text);
  }
  return { stale, added };
}

// --- redaksiyon ------------------------------------------------------------
// TEK KAYNAK. Hem prompt hem komut metni buradan geçer. Komutlar dosya yollarından
// çok daha sık secret taşıyor (`--secret-string`, `--password`, satır içi TOKEN=...),
// ve inbox bulut senkronlu bir vault'a yazıyor — redaksiyon opsiyonel değil.
export const redactSecrets = (text) => String(text)
  .replace(/\b(?:sk|ghp|github_pat|xox[baprs])[-_][A-Za-z0-9_-]{8,}\b/gi, '[REDACTED]')
  .replace(/\b(AKIA[0-9A-Z]{12,})\b/g, '[REDACTED]')
  // JWT — üç bölümlü ve `eyJ` ile başlar. (2026-09-16: sızdığı ölçüldü.)
  .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{6,}/g, '[REDACTED]')
  // Anahtar adı ÖNEKLİ olabilir: eski kural `\b(secret|token|…)` yazdığı için
  // `AWS_SECRET_ACCESS_KEY=…` içindeki SECRET'ın önünde `_` (kelime karakteri) olduğundan
  // `\b` tutmuyordu ve AWS anahtarı OLDUĞU GİBİ inbox'a yazılıyordu. Önek/sonek serbest.
  .replace(/\b[A-Za-z0-9_.-]*(?:api[_-]?key|token|password|passwd|secret|credential)[A-Za-z0-9_.-]*(\s*[:=]\s*)(?!\[REDACTED\])\S+/gi,
    (m, sep) => `${m.slice(0, m.indexOf(sep))}${sep}[REDACTED]`)
  .replace(/(--(?:secret-string|password|token|api-key|secret)(?:=|\s+))(?!\[REDACTED\])\S+/gi, '$1[REDACTED]')
  // mysql/mariadb'nin bitişik parola biçimi: `-pGizli` (boşluk YOK, o yüzden \S+ kuralına takılmıyor).
  .replace(/\b(mysql|mysqldump|mariadb|mariadb-dump)\b([^\n]*?\s-p)(?![\s-])\S+/gi, '$1$2[REDACTED]');

// --- ops komut tespiti ------------------------------------------------------
// NEDEN ALLOWLIST: bir oturumda onlarca okuma komutu (ls/grep/dig/aws describe-*) geçiyor.
// "Okuma olmayan her şey" kuralı hem `ops` alanının 200 karakterlik bütçesini hem brief'in
// 8.000 karakterini patlatır ve asıl mutasyonu kırpmanın dışında bırakır. Bu yüzden yalnız
// DURUMU DEĞİŞTİREN komut aileleri sayılıyor; okuma fiilleri ayrıca açıkça eleniyor.
const AWS_READ = /^(?:describe|list|get|ls|wait|help|search|scan|query|select|lookup|head|test|validate|estimate|check|filter|presign|preview|generate-presigned)/;
const AWS_WRITE = /^(?:create|delete|put|update|modify|change|attach|detach|start|stop|reboot|terminate|enable|disable|register|deregister|associate|disassociate|publish|send|invoke|import|export|restore|reset|rotate|revoke|grant|tag|untag|set|add|remove|apply|deploy|run|copy|move|sync|upload|purchase|request|cancel|accept|reject|activate|deactivate|promote|switch|replace|resume|suspend|cp|mv|rm|mb|rb)(?:[-_]|$)/;

const SUBCOMMAND_RULES = {
  kubectl: /^(?:apply|delete|create|patch|scale|rollout|drain|cordon|uncordon|label|annotate|replace|edit|set|taint|expose|autoscale)$/,
  terraform: /^(?:apply|destroy|import|taint|untaint|state)$/,
  helm: /^(?:install|upgrade|uninstall|rollback|delete)$/,
  eksctl: /^(?:create|delete|upgrade|scale|drain)$/,
  docker: /^push$/,
  // `commit` bilerek YOK: her dev oturumunda birden çok kez geçip `ops`'un 200 karakterini
  // yiyor ve asıl ilginç olanı (docker push, kubectl rollout) kırpmanın dışına itiyor —
  // üstelik o oturumlarda `touched` zaten hikâyeyi anlatıyor. Dışarı çıkan iş `push`.
  git: /^(?:push|tag|merge)$/,
  npm: /^publish$/,
  yarn: /^publish$/,
  pnpm: /^publish$/,
};

// `gh` iki kelimelik: `gh pr create` sayılır, `gh pr list` sayılmaz.
const GH_RULES = /^(?:pr (?:create|merge|close|ready)|release (?:create|delete|upload)|issue create|repo (?:create|delete))$/;

// Heredoc GÖVDESİ komut değil, veridir. `cat > x <<EOF ... EOF` ile bir test fixture'ı ya da
// script yazarken içerideki satırlar aynen ayrıştırılırsa "çalıştırılmış" gibi görünür —
// bu, gerçek bir oturumda ölçülmüş bir false positive kaynağı.
const stripHeredocBodies = (command) => {
  const kept = [];
  let terminator = null;
  for (const line of String(command).split('\n')) {
    if (terminator !== null) {
      if (line.trim() === terminator) terminator = null;
      continue;
    }
    kept.push(line);
    const opener = line.match(/<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/);
    if (opener) terminator = opener[2];
  }
  return kept.join('\n');
};

// Komut dizisini segmentlere böler: `&&`, `||`, `;`, `|`, `&` ve satır sonu.
// TIRNAK DUYARLI olmak ZORUNDA: `node -e "... && git push ..."` gibi bir çağrıda içerideki
// metin argümandır, çalıştırılan komut değil; naif split onu ayrı bir komutmuş gibi gösterir.
const segments = (command) => {
  const text = stripHeredocBodies(command);
  const parts = [];
  let current = '';
  let quote = null;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '\\' && i + 1 < text.length) { current += ch + text[i + 1]; i += 1; continue; }
    if (quote) {
      if (ch === quote) quote = null;
      current += ch;
      continue;
    }
    if (ch === '"' || ch === '\'') { quote = ch; current += ch; continue; }
    if (ch === '\n' || ch === ';') { parts.push(current); current = ''; continue; }
    if (ch === '|' || ch === '&') {
      // `2>&1`, `&>log` gibi yönlendirmelerdeki `&` ayırıcı DEĞİL; ayrılırsa komut
      // etiketi `git push origin X 2>` diye kesik kalır (gerçek oturumda ölçüldü).
      if (ch === '&' && text[i + 1] !== '&' && (text[i - 1] === '>' || text[i + 1] === '>')) {
        current += ch;
        continue;
      }
      if (text[i + 1] === ch) i += 1; // `&&` / `||`
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts;
};

// Segmentin başındaki gürültüyü at: `sudo`, `command`, ve `VAR=deger` ön ekleri.
const bareTokens = (segment) => {
  const tokens = segment.trim().split(/\s+/).filter(Boolean);
  while (tokens.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0]) || /^(?:sudo|command|env|time|nohup)$/.test(tokens[0]))) {
    tokens.shift();
  }
  return tokens;
};

const isOpsSegment = (tokens) => {
  if (!tokens.length) return false;
  const tool = basename(tokens[0]);
  const rest = tokens.slice(1).filter((t) => !t.startsWith('-'));

  if (tool === 'aws') {
    const operation = rest[1] || ''; // aws <servis> <islem>
    if (!operation || AWS_READ.test(operation)) return false;
    return AWS_WRITE.test(operation);
  }
  if (tool === 'gh') return GH_RULES.test(rest.slice(0, 2).join(' '));
  if (tool === 'terraform' && rest[0] === 'state') return /^(?:mv|rm|push)$/.test(rest[1] || '');

  const rule = SUBCOMMAND_RULES[tool];
  return Boolean(rule && rule.test(rest[0] || ''));
};

// Bir shell komut metninden kayda değer ops segmentlerini döner (redakte, tekilleştirilmiş).
// Çıkış koduna BAKILMAZ: tool_use bloğunda exit status yok, tool_result ile eşleştirmenin
// maliyeti değmiyor — başarısız bir mutasyon denemesi de bilinmeye değer.
export function opsFromCommand(command) {
  const found = [];
  for (const segment of segments(command)) {
    if (!isOpsSegment(bareTokens(segment))) continue;
    const clean = redactSecrets(segment).replace(/\s+/g, ' ').trim();
    if (clean && !found.includes(clean)) found.push(clean);
  }
  return found;
}

// Wikilink adlarını karşılaştırmak için normalize eder: dosya adı `project_x_y.md` ile
// frontmatter slug'ı `project-x-y` aynı şeye çözülsün diye tire/alt çizgi/boşluk atılır.
const linkKey = (s) => String(s).toLowerCase().replace(/\.md$/, '').replace(/[-_\s]/g, '');
const linksIn = (text) =>
  [...maskCode(text).masked.matchAll(/\[\[([^\]|#]+)/g)].map((m) => linkKey(m[1].trim()));

// `dir/file` notunun AYNI klasörde var olan bir nota link verip karşılığını almadığı
// durumları döner (dosya adları listesi).
//
// NEDEN VAR: indeks otomatik eşitleniyor ama notların birbirine bağlanması semantik bir
// karar ve zinciri hiçbir şey denetlemiyordu. 2026-08-12'de bir oturum yeni notu yazıp
// ileri linkleri kurdu, karşı nottaki geri linki atladı; eksik, kullanıcı elle söyleyene
// kadar görünmedi. Geri linki otomatik YAZMIYORUZ (hangi notun hak ettiği bir karar),
// sadece aynı turda modele bildiriyoruz.
//
// Hedefi olmayan linkler (`[[henuz-yazilmamis-not]]`) KASITLI olarak sayılmaz — fixlinks.mjs
// ile aynı sözleşme: onlar "yazılacak" işareti, hata değil.
//
// SADECE project↔project çiftleri sayılır. `reference`/`feedback`/`user` notları tasarım
// gereği hub: 8 proje `[[feedback_mysql_via_kubectl]]`'e link verir ve o notun hepsine geri
// link vermesi saçma olur. Vault'ta tüm linkleri simetrik sayan bir kural 179 notu işaretliyor
// (ölçüldü) — yani her yazmada ateşleyip görmezden gelinen bir uyarı olurdu. Kaçırılan gerçek
// vaka iki KARDEŞ proje notu arasındaki bağdı (SUP-1851 ↔ SUP-1858: aynı defect deseni),
// kural da onu hedefliyor.
export function oneWayLinks(dir, file, notes = loadNotes(dir)) {
  const self = notes.find((n) => n.file === file);
  if (!self || self.type !== 'project') return [];

  const byKey = new Map(notes.map((n) => [linkKey(n.file), n]));
  const selfKeys = new Set(
    [self.file, parseFrontmatter(self.text).name].filter(Boolean).map(linkKey),
  );

  const out = [];
  for (const target of new Set(linksIn(self.text))) {
    const note = byKey.get(target);
    if (!note || note.file === self.file || note.type !== 'project') continue;
    const back = new Set(linksIn(note.text));
    if (![...selfKeys].some((k) => back.has(k))) out.push(note.file);
  }
  return out;
}

// Bir leaf'in TAMAMINDAKİ tek yönlü linkler. Notları BİR KEZ okur: not başına oneWayLinks
// çağırmak klasörü her seferinde yeniden okuyordu (64 notluk leaf = 4096 dosya okuması),
// bu da açılış brief'i gibi sıcak yollarda kabul edilemez.
// Dönen: [{ file, targets: [dosya adı] }]
export function oneWayLinksInLeaf(dir) {
  const notes = loadNotes(dir);
  const out = [];
  for (const n of notes) {
    const targets = oneWayLinks(dir, n.file, notes);
    if (targets.length) out.push({ file: n.file, targets });
  }
  return out;
}

// Bir dosya yolu vault'taki hangi leaf klasöre ait? (harness symlink'i üzerinden gelse bile)
// Dönen: { dir, isIndex } | null
export function leafForFile(filePath) {
  if (!filePath || !filePath.endsWith('.md')) return null;
  let real;
  try { real = realpathSync(dirname(filePath)); } catch { return null; }
  // Dönen dir MUTLAKA listLeafDirs()'ün ürettiği biçim olmalı — syncIndexes'in `only`
  // filtresi string eşitliğiyle çalışıyor. Vault bir gün symlink arkasına taşınırsa
  // (iCloud/Dropbox) realpath biçimi farklı olur; iki tarafı da çözüp eşleştiriyoruz,
  // yoksa `only` hiçbir şeyle eşleşmez ve hook sessizce hiçbir iş yapmaz.
  const leaf = listLeafDirs().find((l) => {
    if (l.dir === real) return true;
    try { return realpathSync(l.dir) === real; } catch { return false; }
  });
  if (!leaf) return null;
  return { dir: leaf.dir, isIndex: basename(filePath) === 'MEMORY.md' };
}

// ---------------------------------------------------------------------------
// Bir shell komutunun YAZDIĞI .md yolları.
//
// NEDEN VAR: 2026-08-25'te üç inbox notunun `notes:` alanı da boştu, ama ikisi gerçekte
// brain notu yazmıştı. capture.mjs yalnız Write/Edit tool_use çağrılarını tarıyordu; bu
// makinede oturumlar dosyayı çoğu zaman Bash heredoc ile yazıyor (auto mode "Bash'i tercih
// et" diyor), yani yanlış negatif VARSAYILAN durumdu. İki tüketici: capture.mjs (`notes:`)
// ve nudge.mjs ("hiç not yazılmadı mı?"). Tespit tek yerde.
//
// SINIR: yalnız SHELL yazımı görülür. python/node script'inin İÇİNDEN writeFileSync ile
// yazılan not görünmez — o katmanı okumak çok daha pahalı ve kırılgan olurdu. `rm` de
// yazma sayılmaz (silme, yazma değil).
const quotedTokens = (segment) => {
  const out = [];
  let cur = '';
  let quote = null;
  let has = false;
  for (let i = 0; i < segment.length; i += 1) {
    const ch = segment[i];
    if (ch === '\\' && i + 1 < segment.length) { cur += segment[i + 1]; has = true; i += 1; continue; }
    if (quote) {
      if (ch === quote) { quote = null; continue; }
      cur += ch;
      has = true;
      continue;
    }
    if (ch === '"' || ch === '\'') { quote = ch; has = true; continue; }
    if (/\s/.test(ch)) { if (has) out.push(cur); cur = ''; has = false; continue; }
    cur += ch;
    has = true;
  }
  if (has) out.push(cur);
  return out;
};

const mdTarget = (raw) => {
  if (!raw) return null;
  const p = raw.startsWith('~/') ? join(process.env.HOME, raw.slice(2)) : raw;
  if (!p.endsWith('.md') || p.startsWith('/dev/')) return null;
  return p;
};

export function noteWritesFromCommand(command) {
  const found = [];
  const add = (raw) => {
    const p = mdTarget(raw);
    if (p && !found.includes(p)) found.push(p);
  };

  for (const segment of segments(String(command ?? ''))) {
    const tokens = quotedTokens(segment);
    if (!tokens.length) continue;

    // --- yönlendirme: `> yol`, `>>yol`, `1> yol`. `2>` (stderr) ve `>&` ayrılır.
    for (let i = 0; i < tokens.length; i += 1) {
      const t = tokens[i];
      // Ayrık biçim ÖNCE denenmeli: `>>` tek başına bir token ise, yapışık kalıp onu
      // `>` + `>` diye ayrıştırıp hedefi yutuyor (bu tam olarak böyle kırıldı).
      if (/^(?:1)?>>?$/.test(t)) { add(tokens[i + 1]); continue; }
      const attached = t.match(/^(?:1)?>>?([^>&].*)$/);
      if (attached) add(attached[1]);
    }

    const bare = bareTokens(segment);
    const tool = bare.length ? basename(bare[0]) : '';
    const args = quotedTokens(segment).slice(quotedTokens(segment).indexOf(bare[0]) + 1)
      .filter((a) => !a.startsWith('>') && !a.startsWith('<'));
    const nonFlag = args.filter((a) => a && !a.startsWith('-'));

    // --- sed -i: yerinde düzenleme. Dosya, bayrak olmayan SON argüman (script arg'ından sonra).
    if (tool === 'sed' && args.some((a) => a === '-i' || a.startsWith('-i'))) add(nonFlag.at(-1));
    // --- tee: her bayrak-olmayan argüman bir hedef.
    if (tool === 'tee') for (const a of nonFlag) add(a);
    // --- cp/mv: yalnız HEDEF (son argüman); kaynak yazılmıyor.
    if (tool === 'cp' || tool === 'mv') add(nonFlag.at(-1));
  }
  return found;
}

// ---------------------------------------------------------------------------
// Bir shell komutunun yazdığı notları LEAF'lere çöz. `noteWritesFromCommand` ham metni
// verir (`personal/_kok/not.md` gibi göreli olabilir); burası onu diskteki bir leaf'e bağlar.
//
// İKİ TABAN denenir — cwd VE vault kökü. NEDEN: bu makinedeki baskın yazma biçimi
// `cd ~/Obsidian/brain && cat > personal/_kok/not.md <<EOF`, ama harness hook'a OTURUMUN
// cwd'sini bildirir, compound komutun İÇİNDEKİ `cd`'yi değil. Tek tabanla (cwd) bu biçim
// `.../personal-projects/personal/_kok/not.md`'ye çözülür, realpath patlar ve hook sessizce
// hiçbir iş yapmaz — yani düzeltme "uygulanmış" görünürken çalışmaz. Yanlış taban null
// döndürdüğü için iki tabanı denemenin yanlış pozitif riski yok.
// Komutun BAŞINDAKİ `cd <hedef>`. ÜÇÜNCÜ taban bu: 2026-09-15'te sistem bu deliği kendi
// üzerinde gösterdi — `cd ~/Obsidian/brain/personal/_kok && cat > not.md <<EOF` ile yazılan
// not hiçbir tabana çözülmedi (cwd oturumunki, VAULT kökü de değil) ve MEMORY.md bayat
// kaldı. İki taban `cd <vault-kökü> && cat > <ws>/<leaf>/not.md` biçimini kurtarıyordu ama
// leaf dizinine girip çıplak dosya adı yazan biçimi kurtarmıyordu; ikisi de yaygın.
// Yalnız komutun BAŞINDAKİ cd sayılır: ortadaki `cd`'ler sıralı kabuk durumunu değiştirir,
// onu doğru izlemek tam bir kabuk yorumlayıcısı ister — kapsam dışı, ve yanlış taban zaten
// null döndürdüğü için yanlış pozitif riski yok.
const cdBase = (command) => {
  const m = /^\s*cd\s+(?:'([^']+)'|"([^"]+)"|([^\s;&|]+))/.exec(String(command ?? ''));
  const raw = m && (m[1] ?? m[2] ?? m[3]);
  if (!raw) return null;
  return raw.startsWith('~/') ? join(process.env.HOME, raw.slice(2)) : raw;
};

export function resolveNotePath(raw, cwd, command = null) {
  const clean = String(raw ?? '').trim().replace(/^['"`]|['"`]$/g, '');
  if (!clean) return null;
  const p = clean.startsWith('~/') ? join(process.env.HOME, clean.slice(2)) : clean;
  if (isAbsolute(p)) return leafForFile(p) ? p : null;
  for (const base of [cdBase(command), cwd, VAULT]) {
    if (!base) continue;
    const cand = resolve(base, p);
    if (leafForFile(cand)) return cand;
  }
  return null;
}

// Komut → [{ dir, file }] (yalnız vault'taki non-index notlar, tekilleştirilmiş).
export function noteWriteLeaves(command, cwd) {
  const out = [];
  for (const raw of noteWritesFromCommand(command)) {
    const path = resolveNotePath(raw, cwd, command);
    if (!path) continue;
    const leaf = leafForFile(path);
    if (!leaf || leaf.isIndex) continue;
    const file = basename(path);
    if (!out.some((o) => o.dir === leaf.dir && o.file === file)) out.push({ dir: leaf.dir, file });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Transcript taraması. capture.mjs'in yereliydi; nudge.mjs de AYNI cevaba ihtiyaç duyduğu
// için buraya taşındı — iki kopya tutmak, bu sistemin tekrar tekrar kırıldığı desenin
// kendisi olurdu. Tek geçişte: kullanıcı promptları + yazılan proje dosyaları + yazılan
// brain notları + çalıştırılan mutasyon komutları.
//
// Promptlar YETMİYOR ("ne sorduğunu" söyler, "nerede kaldığını" söylemez) — dosyalar asıl
// sinyal. Dosyalar da yetmiyor: DNS/IAM/deploy işleri baştan sona Bash'ten yürüyor ve tek
// dosyaya dokunmuyor; `ops` o oturumları görünür kılıyor.
const EDIT_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

// Vault yolu: harness symlink'i üzerinden (`…/memory/x.md`) ya da doğrudan vault içinden.
export const isVaultPath = (p) => typeof p === 'string' && (p.includes('/memory/') || p.startsWith(`${VAULT}/`));

const PROMPT_MAX = 300;

export function scanTranscript(transcriptPath, cwd) {
  const out = { prompts: [], files: [], notes: [], ops: [] };
  if (!transcriptPath || !existsSync(transcriptPath)) return out;
  const seenFile = new Set();
  // MEMORY.md ÜRETİLEN dosya — yazılması "bu oturum not yazdı" saymaz.
  const noteFromPath = (p) => {
    if (!isVaultPath(p)) return;
    const n = basename(p).replace(/\.md$/, '');
    if (n !== 'MEMORY' && !out.notes.includes(n)) out.notes.push(n);
  };

  for (const line of readFileSync(transcriptPath, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let ev;
    try { ev = JSON.parse(line); } catch { continue; }
    const content = ev.message?.content;

    // --- asistanın yazma çağrıları ---
    if (ev.type === 'assistant' && Array.isArray(content)) {
      for (const b of content) {
        if (b?.type !== 'tool_use') continue;
        if (b.name === 'Bash') {
          const cmd = b.input?.command || '';
          for (const op of opsFromCommand(cmd)) {
            if (!out.ops.includes(op)) out.ops.push(op);
          }
          // 2026-08-25: `notes:` üç oturumda da boş göründü, ikisi gerçekte not yazmıştı —
          // bu makinede notlar çoğu zaman Bash heredoc ile yazılıyor, yani yanlış negatif
          // VARSAYILANDI. Bilinçli asimetri: Bash tespiti yalnız `notes`u besler, `touched`ı
          // beslemez — `touched`ın sözleşmesi "araçla düzenlenen proje dosyaları".
          // resolveNotePath ŞART: noteWritesFromCommand HAM yolu döndürür ve baskın biçim
          // `cd ~/Obsidian/brain && cat > personal/_kok/not.md` — yani GÖRELİ. isVaultPath
          // göreli yola false der, not sessizce düşerdi: capture.mjs'in `notes:` alanı boş
          // kalır ve nudge.mjs "hiç not yazılmadı" diye YANLIŞ POZİTİF dürtü atardı.
          // 2026-09-11'de sistem bunu kendi üzerinde gösterdi: aynı oturumda 4 not yazılmışken
          // nudge yine de ateşledi. reindex-hook'ta kapatılan deliğin bu tüketicideki hâliydi.
          // `cmd` üçüncü argüman olarak ŞART: komutun başındaki `cd <leaf>` tabanı olmadan
          // `cd <leaf-dizini> && cat > not.md` biçimi yine düşer — aynı deliğin üçüncü tüketicisi.
          for (const p of noteWritesFromCommand(cmd)) noteFromPath(resolveNotePath(p, cwd, cmd) ?? p);
          continue;
        }
        if (!EDIT_TOOLS.has(b.name)) continue;
        const p = b.input?.file_path;
        if (typeof p !== 'string' || seenFile.has(p)) continue;
        seenFile.add(p);
        if (isVaultPath(p)) noteFromPath(p);
        else out.files.push(cwd && p.startsWith(`${cwd}/`) ? p.slice(cwd.length + 1) : basename(p));
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
    out.prompts.push(text.length > PROMPT_MAX ? `${text.slice(0, PROMPT_MAX)}…` : text);
  }
  return out;
}

// Bu oturum kalıcı bir şey ürettiği HALDE hiç not yazılmadı mı?
//
// Eşik BİLEREK yüksek. Her turda konuşan bir dürtü üç günde görmezden gelinir hale gelir —
// bu sistemin geçmişindeki "kural var ama kimse bakmıyor" arızasının aynısı. Üç koşulun
// üçü birden: konuşma gerçekten sürmüş (≥3 prompt), ortada somut bir iş var (mutasyon ya da
// dosya yazması), ve brain'e hiçbir şey düşmemiş.
export function shouldNudge({ prompts = [], ops = [], files = [], notes = [] } = {}) {
  if (prompts.length < 3) return false;
  if (!ops.length && !files.length) return false;
  return notes.length === 0;
}

// ---------------------------------------------------------------------------
// PULL katmanı: arama
//
// NEDEN VAR: brain bu satıra kadar PUSH-only'di. Oturum başında indeks basılıyor
// (brief.mjs), sonunda inbox yazılıyor (capture.mjs), ARADA hiçbir şey yok. Harness
// yalnız cwd'nin MEMORY.md'sini yüklüyor, o da not başına TEK SATIR — yani doğru notu
// bulmak, o satırın sorulanı tesadüfen içermesine bağlıydı, gövde hiç açılmıyordu.
// Kullanıcının elle "brainde vardı" demek zorunda kalması bunun semptomuydu.
//
// İNDEKS DOSYASI YOK, bilerek: senkronize edilmesi gereken ikinci bir doğruluk kaynağı,
// tam olarak ortadan kaldırmaya çalıştığımız arıza sınıfı. 507 dosya / 3,3 MB'ta tam
// tarama milisaniyeler mertebesinde ve sonuç her zaman diskle aynı.

// Türkçe katlama. Sorgu ve metin AYNI fonksiyondan geçmek zorunda: 'İ' locale'e göre
// 'i̇' (i + combining dot) üretiyor, yani naif toLowerCase() 'İSTANBUL' ile 'istanbul'u
// ayrı kelime yapar. Aynı tuzak project-uppercase-casing notunda siteyi bozmuştu.
const FOLD_MAP = { İ: 'i', I: 'i', ı: 'i', Ş: 's', ş: 's', Ğ: 'g', ğ: 'g', Ü: 'u', ü: 'u', Ö: 'o', ö: 'o', Ç: 'c', ç: 'c' };
export const fold = (s) => String(s ?? '').replace(/[İIıŞşĞğÜüÖöÇç]/g, (c) => FOLD_MAP[c]).toLowerCase();

// --- terim eşleştirme -------------------------------------------------------
// 2026-09-16'da ÖLÇÜLDÜ: eski `indexOf` tabanlı sayım ALT-DİZE eşleştiriyordu — sorgudaki
// "mı" `tanımı` içinde, "ne" `internet` içinde sayılıyordu. Türkçe sondan eklemeli olduğu
// için de "kolesterolüm" sorgusu `kolesterol` notunu HİÇ bulamıyordu. İki düzeltme:
//   1. eşleşme TOKEN BAŞINDAN (kelime ortasında sayılmaz),
//   2. gövde+sorgu 5 karakterlik sabit ön-ek kökünden ("truncation stemming") — Türkçe IR'de
//      standart ucuz yöntem; "reklam/reklama", "hisse/hisseleri" aynı köke düşer.
const STEM_LEN = 5;
const stem = (t) => (t.length > STEM_LEN ? t.slice(0, STEM_LEN) : t);

// Ayırt etmeyen kelimeler. Bunlar skorda kaldığında sorguyu uzun notlara doğru çekiyor
// (ölçüldü: `project_prod_upgrade_runbook` sorgudan BAĞIMSIZ olarak ilk sırada geliyordu).
const STOPWORDS = new Set(fold([
  'mi','mı','mu','mü','ne','ve','ile','bir','bu','su','şu','o','da','de','ki','icin','için',
  'nasil','nasıl','nedir','neden','hangi','kim','var','yok','olan','oldu','olur','falan',
  'ben','sen','biz','siz','onlar','benim','bizim','daha','cok','çok','az','gibi','kadar',
  'ama','veya','ya','yani','ise','eger','eğer','sonra','once','önce','simdi','şimdi','mi̇',
  'the','a','an','of','to','in','on','for','and','or','is','are','was','it','that','this',
].join(' ')).split(' '));

// Bir metni token köklerine çevirir. Rakam/harf dışı her şey ayraç.
const tokenStems = (folded) => {
  const out = [];
  for (const tok of folded.split(/[^a-z0-9]+/)) if (tok) out.push(stem(tok));
  return out;
};

// Terim frekansı haritası (kök → sayı) + toplam token sayısı.
const tfMap = (folded) => {
  const m = new Map();
  let n = 0;
  for (const st of tokenStems(folded)) { m.set(st, (m.get(st) || 0) + 1); n++; }
  return { m, n };
};

// Alan ağırlıkları: başlık > index_hook/description > gövde.
const W_TITLE = 8;
const W_HOOK = 4;
const W_BODY = 1;
// BM25 parametreleri. b=0,75 klasik: doküman uzunluğu normalizasyonu. Eski skorlamada
// normalizasyon HİÇ YOKTU — 40 KB'lık bir runbook, ortak bir terimi yeterince tekrarladığı
// için her sorguyu kazanıyordu. k1 terim doygunluğu (10. tekrar 2.'si kadar değerli değil).
const BM25_K1 = 1.2;
const BM25_B = 0.75;
// feedback/user = DAVRANIŞ kuralı. Onu kaçırmak en pahalı hata sınıfı (kullanıcı düzeltmek
// zorunda kalıyor); bir proje detayını kaçırmak daha ucuz. Bu yüzden çarpanlı.
const TYPE_BOOST = { feedback: 1.5, user: 1.5 };
// Arşiv = emekliye ayrılmış karar. Aranabilir kalmalı ama canlı notu ASLA geçmemeli.
const ARCHIVE_MULT = 0.5;
const EXCERPT_PAD = 60;

// Gövde = frontmatter'dan SONRASI. İki sebeple: (1) alıntı "--- name: … description: …"
// diye başlamasın (okunmaz ve token yakar), (2) description/index_hook zaten W_HOOK ile
// ayrıca sayılıyor — frontmatter'ı gövdeye de katmak aynı isabeti iki kez ödüllendirir.
const stripFrontmatter = (text) => {
  if (!text.startsWith('---\n')) return text;
  const end = text.indexOf('\n---', 4);
  return end === -1 ? text : text.slice(end + 4);
};

const excerptAround = (text, needle) => {
  const at = fold(text).indexOf(needle);
  if (at === -1) return '';
  const from = Math.max(0, at - EXCERPT_PAD);
  const raw = text.slice(from, at + needle.length + EXCERPT_PAD).replace(/\s+/g, ' ').trim();
  return `${from > 0 ? '…' : ''}${raw}${at + needle.length + EXCERPT_PAD < text.length ? '…' : ''}`;
};

// sources: [{ dir, label, archive? }] — KAPSAM ÇAĞIRANIN İŞİ. Fonksiyon verilmeyen hiçbir
// dizine bakmaz; iş alanları arası sızıntı (kişisel bir oturumda işveren notunun görünmesi)
// böyle imkânsızlaşıyor ve testlenebilir kalıyor.
export function searchNotes(query, sources = [], { type = null } = {}) {
  const rawTerms = fold(query).split(/[^a-z0-9]+/).filter(Boolean);
  // Stopword'leri at — ama HEPSİ stopword'se sorguyu boşaltma (ör. "ne yapmalı").
  let terms = [...new Set(rawTerms.filter((t) => !STOPWORDS.has(t) && t.length > 1).map(stem))];
  if (!terms.length) terms = [...new Set(rawTerms.map(stem))];
  if (!terms.length) return [];

  // 1. geçiş: dokümanları topla, alan bazlı tf ve uzunluk hesapla, kök sözlüğünü çıkar.
  const docs = [];
  const vocab = new Set();
  for (const src of sources) {
    let notes;
    try { notes = loadNotes(src.dir); } catch { continue; } // olmayan/okunamayan dizin sessiz
    for (const n of notes) {
      if (type && n.type !== type) continue;
      const bodyText = stripFrontmatter(n.text);
      const title = tfMap(fold(`${n.name} ${n.file}`));
      const hook = tfMap(fold(`${n.hook} ${n.description}`));
      const body = tfMap(fold(bodyText));
      const len = title.n + hook.n + body.n;
      const doc = { n, src, bodyText, title: title.m, hook: hook.m, body: body.m, len,
        lenT: title.n, lenH: hook.n, lenB: body.n };
      docs.push(doc);
      for (const m2 of [title.m, hook.m, body.m]) for (const k of m2.keys()) vocab.add(k);
    }
  }
  if (!docs.length) return [];

  // KISA TERİM GENİŞLETME. Kök 5 karakter olduğu için "kart"(4) ile "kartlar"→"kartl" eşleşmez;
  // kısa terimi, gerçekten korpusta VAR OLAN köklerin arasından ön-ek eşleşmesiyle genişletiyoruz.
  // Sözlükten genişletmek uydurma kök üretmiyor, ve "kartal"→"karta" gibi yakın ama farklı
  // kelimeler ayrı kök oldukları için yanlış pozitif olarak değil, ayrı terim olarak giriyor.
  const expanded = [];
  for (const t of terms) {
    if (t.length >= STEM_LEN || vocab.has(t)) { expanded.push([t]); continue; }
    const hits = [...vocab].filter((v) => v.startsWith(t));
    expanded.push(hits.length ? hits : [t]);
  }

  const N = docs.length;
  // Alan bazlı ortalama uzunluk (BM25F). TEK bir doküman uzunluğuyla normalize etmek yetmiyor:
  // 2026-09-16'da ölçüldü — terimi 200 kez tekrarlayan dolgu bir not, terimi BAŞLIĞINDA taşıyan
  // kısa notu hâlâ geçiyordu, çünkü tek doygunluk eğrisinde ikisi de tepeye yapışıyor. Her alan
  // AYRI doyurulup SONRA ağırlıklanınca başlık/hook isabeti gövde tekrarını yeniyor.
  const avg = (k) => docs.reduce((s2, d) => s2 + d[k], 0) / N || 1;
  const avgT = avg('lenT'); const avgH = avg('lenH'); const avgB = avg('lenB');
  // df: bir terim GRUBU (genişletilmiş varyantlar) kaç dokümanda geçiyor.
  const df = expanded.map((group) =>
    docs.reduce((c, d) => c + (group.some((t) => d.title.has(t) || d.hook.has(t) || d.body.has(t)) ? 1 : 0), 0));

  // 2. geçiş: BM25 + alan ağırlığı. IDF, her notta geçen proje adı gibi terimleri kendiliğinden
  // söndürür — eski skorlamada böyle bir terim sorgunun tamamını domine ediyordu.
  const rows = [];
  for (const d of docs) {
    let score = 0;
    let matched = 0;
    let best = null;
    for (let gi = 0; gi < expanded.length; gi++) {
      let tfT = 0; let tfH = 0; let tfB = 0;
      let bestT = null; let bestF = 0;
      for (const t of expanded[gi]) {
        const a = d.title.get(t) || 0; const b2 = d.hook.get(t) || 0; const c = d.body.get(t) || 0;
        tfT += a; tfH += b2; tfB += c;
        const ft = a + b2 + c;
        if (ft > bestF) { bestF = ft; bestT = t; }
      }
      if (!tfT && !tfH && !tfB) continue;
      matched++;
      // Her alan KENDİ uzunluğuyla ayrı doyuyor, sonra ağırlıklanıyor.
      const sat = (tf, len, avgLen) =>
        (tf ? (tf * (BM25_K1 + 1)) / (tf + BM25_K1 * (1 - BM25_B + BM25_B * (len / (avgLen || 1)))) : 0);
      const f = W_TITLE * sat(tfT, d.lenT, avgT) + W_HOOK * sat(tfH, d.lenH, avgH) + W_BODY * sat(tfB, d.lenB, avgB);
      const n = df[gi] || 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      score += idf * f;
      if (!best || f > best.f) best = { t: bestT, f };
    }
    if (!matched) continue;
    // Kapsama bonusu: iki terimi tutan not, tek terimi çok tekrarlayandan önce gelir.
    score *= (matched / expanded.length) ** 0.5;
    score *= (TYPE_BOOST[d.n.type] || 1) * (d.src.archive ? ARCHIVE_MULT : 1);
    rows.push({
      file: d.n.file,
      path: d.n.path,
      label: d.src.label,
      name: d.n.name,
      type: d.n.type,
      archive: Boolean(d.src.archive),
      score: Math.round(score * 100) / 100,
      matched,
      excerpt: excerptAround(d.bodyText, best.t) || excerptAround(`${d.n.name} · ${d.n.hook}`, best.t),
    });
  }
  return rows.sort((a2, b2) => b2.score - a2.score || b2.matched - a2.matched || a2.file.localeCompare(b2.file));
}

// ---------------------------------------------------------------------------
// ÖZ ONARIM KATMANI
//
// NEDEN VAR: 2026-09-15'te vault'ta 27 ölü wikilink + 37 notluk geri link borcu + iş alanı
// içinde bağlanmamış 3 proje bulundu. Üçü de "tespit edilmiş ama düzeltilmemiş" sınıfındaydı:
// fixlinks/backlink/verify sorunu GÖRÜYOR, düzeltmeyi ELLE beklemek zorundaydı. Kullanıcının
// şikayeti tam buydu — "durup durup noldu düzelt demek istemiyorum". Bu yüzden mekanik olan
// kısım artık yazma anında (PostToolUse) ve oturum açılışında (SessionStart) kendiliğinden
// kapanıyor; semantik olan kısım (inbox küratörlüğü, notu-olan yetim klasör) hâlâ bildirimde.
//
// SINIR — neyin otomatiği güvenli: yalnız TEK ADAYLI mekanik eşleşme. Belirsiz ya da hedefi
// hiç olmayan link kasıtlı bırakılır (`[[henuz-yazilmamis-not]]` "yazılacak" işaretidir).

// Vault'taki tüm not DOSYA ADLARININ normalize indeksi: linkKey → Set(gerçek dosya adı).
// Obsidian `[[hedef]]`'i DOSYA ADIYLA çözer, frontmatter `name:` slug'ıyla değil; vault'ta
// 573 notun 230'unda ikisi farklı (dosyalar snake_case, slug'lar kebab-case) ve harness'ın
// hafıza talimatı "slug ile bağla" diyor — yani kurala uyan link Obsidian'da ölü doğuyor.
export function linkTargetIndex() {
  const byKey = new Map();
  const walk = (d) => {
    let entries;
    try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      if (e.isDirectory()) { walk(join(d, e.name)); continue; }
      if (!e.name.endsWith('.md')) continue;
      const base = e.name.replace(/\.md$/, '');
      const k = linkKey(base);
      if (!byKey.has(k)) byKey.set(k, new Set());
      byKey.get(k).add(base);
    }
  };
  walk(VAULT);
  return byKey;
}

// Metindeki mekanik link uyuşmazlıklarını düzeltir (tire↔alt çizgi, büyük/küçük harf, .md).
// Dönen: { text, fixed: [{from,to}], unresolved: [ad], scanned }
// Kod bloklarını ve satır-içi kodu maskeler. NEDEN: 2026-09-16 denetiminde
// `functions/i/[[code]].ts` (Cloudflare Pages catch-all dosya adı) ve bir markdown tablosundaki
// `[[path]]` ölü wikilink sanıldı. Bu yalnız gürültü değil GERÇEK BOZMA YOLU: tek adaylı bir
// `code.md` notu var olsaydı onarım o DOSYA ADINI sessizce yeniden yazardı. Link mantığının
// tamamı (onarım + giden link çıkarımı) artık maskelenmiş metin üzerinde çalışıyor.
const CODE_RE = /(?:^|\n)[ \t]*(?:```|~~~)[\s\S]*?(?:```|~~~)|`[^`\n]*`/g;
export function maskCode(text) {
  const held = [];
  const masked = String(text).replace(CODE_RE, (m) => `\u0000${held.push(m) - 1}\u0000`);
  return { masked, restore: (t) => t.replace(/\u0000(\d+)\u0000/g, (_, i) => held[Number(i)]) };
}

export function repairLinksInText(text, index) {
  const fixed = [];
  const unresolved = [];
  let scanned = 0;
  const { masked, restore } = maskCode(text);
  const out = restore(masked.replace(/\[\[([^\]|#]+)([^\]]*)\]\]/g, (whole, target, rest) => {
    scanned += 1;
    const t = target.trim();
    const base = t.replace(/\.md$/, '');
    const cands = index.get(linkKey(base));
    if (cands?.has(base)) return whole;              // zaten birebir dosya adı
    if (!cands) { unresolved.push(t); return whole; } // hedefi yok → kasıtlı bırak
    if (cands.size !== 1) return whole;              // belirsiz → dokunma
    const to = [...cands][0];
    fixed.push({ from: t, to });
    return `[[${to}${rest}]]`;
  }));
  return { text: out, fixed, unresolved, scanned };
}

// Verilen not dosyalarını yerinde onarır ve DOKUNULAN LEAF'İN İNDEKSİNİ EŞİTLER.
// İndeks eşitlemesi burada olmak zorunda: çağıran tarafa bırakılırsa "link onarıldı ama
// MEMORY.md bayat kaldı" diye eski arızanın yerine yenisi konur.
export function repairLinkFiles(paths, index = linkTargetIndex()) {
  const repaired = [];
  const dirs = new Set();
  for (const p of paths) {
    let text;
    try { text = readFileSync(p, 'utf8'); } catch { continue; }
    const r = repairLinksInText(text, index);
    if (!r.fixed.length) continue;
    atomicWrite(p, r.text);
    for (const f of r.fixed) repaired.push({ file: basename(p), ...f });
    const leaf = leafForFile(p);
    if (leaf) dirs.add(leaf.dir);
  }
  if (dirs.size) syncIndexes({ only: [...dirs] });
  return repaired;
}

// A'ya giden linki B'nin gövdesine ekler. Frontmatter'ın dışında kalması şart: notun
// sonundaki `İlgili:` satırı varsa ona eklenir, yoksa dosyanın sonuna yeni satır açılır.
// (2026-09-15'te backlink.mjs'ten buraya taşındı — artık üç tüketicisi var: CLI, PostToolUse
// hook'u ve SessionStart süpürmesi. backlink.mjs onu yeniden dışa aktarıyor, testi bozulmasın.)
const RELATED = 'İlgili:';
export function withBacklink(text, targetName) {
  const link = `[[${targetName}]]`;
  const lines = text.replace(/\s+$/, '').split('\n');
  const idx = lines.findLastIndex((l) => l.trimStart().startsWith(RELATED));

  if (idx >= 0) {
    if (lines[idx].includes(link)) return `${lines.join('\n')}\n`;
    lines[idx] = `${lines[idx].replace(/[.\s]+$/, '')}, ${link}`;
    return `${lines.join('\n')}\n`;
  }
  return `${lines.join('\n')}\n\n${RELATED} ${link}\n`;
}

// Tek yönlü project↔project linkleri için yazılacak geri link planı.
// `sources` verilirse yalnız o notlar KAYNAK sayılır (yazma anı yolu); verilmezse leaf'in
// tamamı taranır (süpürme yolu).
export function backlinkPlan(leaves = listLeafDirs(), sources = null) {
  const changes = [];
  for (const leaf of leaves) {
    const notes = loadNotes(leaf.dir);
    const byFile = new Map(notes.map((n) => [n.file, n]));
    for (const source of notes) {
      if (source.status === 'archived') continue;
      if (sources && !sources.includes(source.file)) continue;
      for (const targetFile of oneWayLinks(leaf.dir, source.file, notes)) {
        const target = byFile.get(targetFile);
        if (!target || target.status === 'archived') continue;
        changes.push({
          dir: leaf.dir,
          target: targetFile,
          path: join(leaf.dir, targetFile),
          sourceName: source.file.replace(/\.md$/, ''),
        });
      }
    }
  }
  return changes;
}

// Aynı hedefe birden çok kaynak gelebilir; tek okuma-yazma turunda birleştir.
export function groupBacklinks(changes) {
  const byTarget = new Map();
  for (const c of changes) {
    if (!byTarget.has(c.path)) byTarget.set(c.path, { ...c, sources: [] });
    byTarget.get(c.path).sources.push(c.sourceName);
  }
  return byTarget;
}

// Planı diske yazar + indeksi eşitler + ne yazdığını loglar (vault git altında ama commit'ler
// seyrek; ÇALIŞMA bazında geri alma kaydı bu log). Dönen: gruplanmış harita.
export function applyBacklinks(changes, { log = null, append = false } = {}) {
  const byTarget = groupBacklinks(changes);
  if (!byTarget.size) return byTarget;

  const touchedDirs = new Set();
  for (const { path, sources, dir } of byTarget.values()) {
    let text;
    try { text = readFileSync(path, 'utf8'); } catch { continue; }
    for (const name of sources) text = withBacklink(text, name);
    atomicWrite(path, text);
    touchedDirs.add(dir);
  }
  if (log) {
    const rel = (p) => p.replace(`${VAULT}/`, '');
    const body = [...byTarget.values()]
      .map(({ path, sources }) => `${new Date().toISOString()} ${rel(path)} <- ${sources.join(', ')}`)
      .join('\n');
    if (append) appendFileSync(log, `${body}\n`);
    else atomicWrite(log, `${body}\n`);
  }
  if (touchedDirs.size) syncIndexes({ only: [...touchedDirs] });
  return byTarget;
}

// Bir iş alanı kökünün İÇİNDE olup vault'a bağlanmamış harness memory klasörleri.
// O dizinde açılan oturum BOŞ hafıza yükler ve orada yazılan not vault'a hiç girmez.
// `notes: 0` olanlar güvenle otomatik bağlanabilir (taşınacak dosya yok); notu OLANLAR
// (yetim hafıza) bilinçli olarak otomatiğin dışında — dosya taşıma çakışma üretebilir,
// o karar kullanıcının. Kapsam dışı boş klasörler (ör. ~/Desktop) zararsızdır, dönmez.
export function unlinkedProjects() {
  const out = [];
  let names;
  try { names = readdirSync(PROJECTS_DIR).sort(); } catch { return out; }
  for (const name of names) {
    const memPath = join(PROJECTS_DIR, name, 'memory');
    let st;
    try { st = lstatSync(memPath); } catch { continue; }
    if (st.isSymbolicLink()) continue;
    let files = [];
    try { files = readdirSync(memPath).filter((f) => f !== '.DS_Store'); } catch { continue; }
    const real = resolveRealPath(name);
    if (!real) continue;
    const ws = workspaceForCwd(real);
    if (!ws) continue;
    out.push({ harnessDir: join(PROJECTS_DIR, name), memPath, real, ws, notes: files.length });
  }
  return out;
}
