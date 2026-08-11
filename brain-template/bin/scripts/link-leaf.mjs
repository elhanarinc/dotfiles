// Bir projeyi vault'a bağlar: harness'ın o proje için tuttuğu `memory/` klasörünü
// `<is-alani>/<leaf>/` altına taşır ve yerine symlink bırakır. Yeni makinede ya da yeni
// bir repo açıldığında YAPILACAK TEK İŞ budur.
//
//   node bin/scripts/link-leaf.mjs personal ~/Desktop/personal-projects/yeni-repo
//   node bin/scripts/link-leaf.mjs personal ~/Desktop/personal-projects --as _kok
//
// NEDEN SYMLINK: harness yalnızca `~/.claude/projects/<dizin>/memory/MEMORY.md`'yi yükler.
// Klasörü vault'a taşıyıp symlink bırakınca harness davranışı hiç değişmez, notlar
// Obsidian'da görünür olur. `oneshot/migrate-workspaces.mjs` bunu toplu yapıyordu ama
// harness dizin adından GERİYE doğru tahmin ediyordu; burada yön ileri, yani tahmin yok.
import { existsSync, lstatSync, mkdirSync, readdirSync, readlinkSync, renameSync, rmdirSync, symlinkSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { VAULT, WORKSPACES, syncIndexes } from './lib.mjs';

const args = process.argv.slice(2).filter((a) => a !== '--as');
const asIdx = process.argv.indexOf('--as');
const leafOverride = asIdx > -1 ? process.argv[asIdx + 1] : null;
const [ws, rawPath] = args;

const die = (msg) => { console.error(`✗ ${msg}`); process.exit(1); };

if (!ws || !rawPath) die('kullanım: node bin/scripts/link-leaf.mjs <is-alani> <proje-yolu> [--as <klasor>]');
if (!WORKSPACES.includes(ws)) {
  die(`bilinmeyen iş alanı: ${ws}\n  bin/state/config.json içindekiler: ${WORKSPACES.join(', ') || '(boş — önce config.json doldur)'}`);
}

const projectPath = resolve(rawPath.startsWith('~/') ? join(process.env.HOME, rawPath.slice(2)) : rawPath);
if (!existsSync(projectPath)) die(`proje klasörü yok: ${projectPath}`);

const leaf = (leafOverride || basename(projectPath)).replace(/[^A-Za-z0-9._-]/g, '-');
const leafDir = join(VAULT, ws, leaf);

// Harness, gerçek yoldaki alfanümerik olmayan HER karakteri '-' yapar ('/', '_', '.' hepsi).
// İleri yön tek anlamlı: yolu biliyorsak dizin adı kesin hesaplanır.
const harnessDir = join(process.env.HOME, '.claude', 'projects', projectPath.replace(/[^A-Za-z0-9]/g, '-'));
const memPath = join(harnessDir, 'memory');

if (existsSync(leafDir) && !lstatSync(leafDir).isDirectory()) die(`hedef klasör değil: ${leafDir}`);

let st = null;
try { st = lstatSync(memPath); } catch { /* henüz yok */ }

if (st?.isSymbolicLink()) {
  const target = readlinkSync(memPath);
  if (target === leafDir) { console.log(`= zaten bağlı: ${ws}/${leaf}`); process.exit(0); }
  die(`memory zaten başka bir hedefe bağlı: ${target}\n  önce elle çöz, bu script üzerine yazmaz`);
}

mkdirSync(leafDir, { recursive: true });

// Harness bu proje için zaten not tutmuşsa onları KAYBETME: vault'a taşı.
let moved = 0;
if (st?.isDirectory()) {
  for (const f of readdirSync(memPath)) {
    const dest = join(leafDir, f);
    if (existsSync(dest)) die(`çakışma: ${dest} zaten var — elle birleştir`);
    renameSync(join(memPath, f), dest);
    moved += 1;
  }
  rmdirSync(memPath);
}

mkdirSync(harnessDir, { recursive: true });
symlinkSync(leafDir, memPath);
try { syncIndexes({ only: [leafDir] }); } catch { /* not yoksa indeks de yok */ }

console.log(`✓ ${projectPath}`);
console.log(`  ${memPath} → ${ws}/${leaf}${moved ? ` (${moved} dosya taşındı)` : ' (boş başladı)'}`);
