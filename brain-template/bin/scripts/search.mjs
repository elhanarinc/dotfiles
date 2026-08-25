// Brain arama CLI'ı — PULL katmanının girişi.
//
//   node bin/scripts/search.mjs "<terimler>" [--ws <ad>] [--all] [--type <tip>] [--limit N] [--body]
//
// NEDEN VAR: harness yalnız cwd'nin MEMORY.md'sini yüklüyor ve o da not başına TEK SATIR.
// Kökte çalışırken alt projelerin (packrip-ios 94, pokemon 54, ghost 34…) hafızası hiç
// görünmüyor, yüklenen leaf'te bile gövde açılmıyordu. Bu script o boşluğu kapatıyor:
// cevap vermeden ÖNCE aranacak yer burası. Skorlama/katlama mantığı lib.mjs'te (searchNotes),
// burası sadece KAPSAM + biçim — böylece mantık test edilebilir kalıyor (bin/tests/search.test.mjs).
//
// KAPSAM KURALI (kullanıcı kararı 2026-08-25): varsayılan = cwd'nin iş alanının TÜM leaf'leri
// + o iş alanının arşivi. Başka iş alanı ancak `--ws` ile. Sebep: bir iş alanının notları
// (özellikle işveren tarafı) başka bir alanın oturumuna sızmasın, ama kökte çalışırken
// AYNI alandaki alt projelerin hafızası GÖRÜNSÜN.
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { VAULT, ARCHIVE_DIR, WORKSPACES, listLeafDirs, workspaceForCwd, searchNotes } from './lib.mjs';

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const query = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--') && ['ws', 'type', 'limit'].includes(argv[i - 1].slice(2)))).join(' ');

if (!query.trim() || flag('help')) {
  console.log(`Kullanım: search.mjs "<terimler>" [--ws <${WORKSPACES.join('|') || 'ad'}>] [--all] [--type user|feedback|project|reference] [--limit N] [--body]

Varsayılan kapsam: cwd'nin iş alanının tüm memory klasörleri + o alanın arşivi.
Terimler OR'lanır; çok terim tutan not öne çıkar. Türkçe İ/I/ş/ğ/ü/ö/ç katlanır.`);
  process.exit(0);
}

// Arşiv iç içe ve iş alanına göre bölünmüş (archive/<ws>/…, archive/_kaldirilan-repolar/<ws>/…,
// …/diger/…). Kapsam kuralını burada uyguluyoruz: yol içinde iş alanı segmenti olan alt ağaçlar
// + sahipsiz `diger`. Arşiv zaten ×0,5 ile cezalı, canlı notu geçemez.
const archiveDirsFor = (wsNames) => {
  const out = [];
  const walk = (dir) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    if (entries.some((e) => e.isFile() && e.name.endsWith('.md') && e.name !== 'MEMORY.md')) {
      const rel = relative(VAULT, dir);
      const segs = rel.split('/');
      if (!wsNames || segs.some((s) => wsNames.includes(s) || s === 'diger')) {
        out.push({ dir, label: rel, archive: true });
      }
    }
    for (const e of entries) if (e.isDirectory() && !e.name.startsWith('.')) walk(join(dir, e.name));
  };
  if (existsSync(ARCHIVE_DIR)) walk(ARCHIVE_DIR);
  return out;
};

const all = flag('all');
const wanted = opt('ws', all ? null : workspaceForCwd(process.cwd()));

const leaves = listLeafDirs()
  .filter((l) => all || !wanted || l.ws === wanted)
  .map((l) => ({ dir: l.dir, label: `${l.ws}/${l.label}` }));

const sources = [...leaves, ...archiveDirsFor(all ? null : (wanted ? [wanted] : null))];

if (!sources.length) {
  console.log(`0 isabet — kapsamda memory klasörü yok${wanted ? ` (iş alanı: ${wanted})` : ''}.`);
  console.log(`cwd tanımlı bir iş alanına düşmüyorsa --ws veya --all kullan (${WORKSPACES.join(', ')}).`);
  process.exit(0);
}

const limit = Number(opt('limit', 8)) || 8;
const rows = searchNotes(query, sources, { type: opt('type') });

const scopeLabel = all ? 'tüm vault' : (wanted || 'kapsam yok');
if (!rows.length) {
  console.log(`0 isabet · "${query}" · kapsam: ${scopeLabel} (${sources.length} klasör)`);
  process.exit(0);
}

console.log(`${rows.length} isabet · "${query}" · kapsam: ${scopeLabel} (${sources.length} klasör) · ilk ${Math.min(limit, rows.length)}\n`);
for (const [i, r] of rows.slice(0, limit).entries()) {
  const rel = relative(VAULT, r.path);
  console.log(`[${i + 1}] ${r.score} ${r.type}${r.archive ? ' [archive]' : ''} · ${rel}`);
  console.log(`    ${r.name} — ${r.excerpt}`);
  if (flag('body')) {
    console.log('    ---');
    for (const line of readFileSync(r.path, 'utf8').split('\n')) console.log(`    ${line}`);
    console.log('    ---');
  }
}
if (rows.length > limit) console.log(`\n…+${rows.length - limit} isabet daha (--limit ile artır)`);
console.log(`\nTam gövde: sed -n '1,200p' ${VAULT.replace(process.env.HOME, '~')}/<yol>   ·   veya --body`);
