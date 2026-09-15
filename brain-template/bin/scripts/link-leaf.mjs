// Bir projeyi vault'a bağlar: harness'ın o proje için tuttuğu `memory/` klasörünü
// `<is-alani>/<leaf>/` altına taşır ve yerine symlink bırakır. Yeni makinede ya da yeni
// bir repo açıldığında YAPILACAK TEK İŞ budur.
//
//   node bin/scripts/link-leaf.mjs <is-alani> ~/code/yeni-repo
//   node bin/scripts/link-leaf.mjs <is-alani> ~/code --as _kok
//
// NEDEN SYMLINK: harness yalnızca `~/.claude/projects/<dizin>/memory/MEMORY.md`'yi yükler.
// Klasörü vault'a taşıyıp symlink bırakınca harness davranışı hiç değişmez, notlar
// Obsidian'da görünür olur. `oneshot/migrate-workspaces.mjs` bunu toplu yapıyordu ama
// harness dizin adından GERİYE doğru tahmin ediyordu; burada yön ileri, yani tahmin yok.
//
// Gövde `linkLeaf()` fonksiyonuna çıkarıldı ve hata yolu `process.exit` yerine
// `throw` oldu. NEDEN: brief.mjs (SessionStart) bağlanmamış BOŞ projeleri artık kendi
// bağlıyor; bir SessionStart hook'unun exit 1 ile düşmesi brief'i sessizce yok eder —
// yani bu sistemin var olma sebebi olan arıza sınıfının aynısı olurdu.
import { existsSync, lstatSync, mkdirSync, readdirSync, readlinkSync, renameSync, rmdirSync, symlinkSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { VAULT, WORKSPACES, syncIndexes } from './lib.mjs';

// Dönen: { ws, leaf, leafDir, memPath, moved, already }
// Fırlatır: bilinmeyen iş alanı, olmayan klasör, başka hedefe bağlı memory, dosya çakışması.
export function linkLeaf(ws, rawPath, { as = null } = {}) {
  if (!ws || !rawPath) throw new Error('kullanım: node bin/scripts/link-leaf.mjs <is-alani> <proje-yolu> [--as <klasor>]');
  if (!WORKSPACES.includes(ws)) {
    throw new Error(`bilinmeyen iş alanı: ${ws}\n  bin/state/config.json içindekiler: ${WORKSPACES.join(', ') || '(boş — önce config.json doldur)'}`);
  }

  const projectPath = resolve(rawPath.startsWith('~/') ? join(process.env.HOME, rawPath.slice(2)) : rawPath);
  if (!existsSync(projectPath)) throw new Error(`proje klasörü yok: ${projectPath}`);

  const leaf = (as || basename(projectPath)).replace(/[^A-Za-z0-9._-]/g, '-');
  const leafDir = join(VAULT, ws, leaf);

  // Harness, gerçek yoldaki alfanümerik olmayan HER karakteri '-' yapar ('/', '_', '.' hepsi).
  // İleri yön tek anlamlı: yolu biliyorsak dizin adı kesin hesaplanır.
  const harnessDir = join(process.env.HOME, '.claude', 'projects', projectPath.replace(/[^A-Za-z0-9]/g, '-'));
  const memPath = join(harnessDir, 'memory');

  if (existsSync(leafDir) && !lstatSync(leafDir).isDirectory()) throw new Error(`hedef klasör değil: ${leafDir}`);

  let st = null;
  try { st = lstatSync(memPath); } catch { /* henüz yok */ }

  if (st?.isSymbolicLink()) {
    const target = readlinkSync(memPath);
    if (target === leafDir) return { ws, leaf, leafDir, memPath, moved: 0, already: true };
    throw new Error(`memory zaten başka bir hedefe bağlı: ${target}\n  önce elle çöz, bu script üzerine yazmaz`);
  }

  // Harness bu proje için zaten not tutmuşsa onları KAYBETME: vault'a taşı. Çakışma olursa
  // HİÇBİR ŞEY taşımadan fırlat — yarı taşınmış bir klasör iki yerde bölünmüş hafıza demek.
  const pending = st?.isDirectory() ? readdirSync(memPath) : [];
  for (const f of pending) {
    if (existsSync(join(leafDir, f))) throw new Error(`çakışma: ${join(leafDir, f)} zaten var — elle birleştir`);
  }

  mkdirSync(leafDir, { recursive: true });
  let moved = 0;
  for (const f of pending) { renameSync(join(memPath, f), join(leafDir, f)); moved += 1; }
  if (st?.isDirectory()) rmdirSync(memPath);

  mkdirSync(harnessDir, { recursive: true });
  symlinkSync(leafDir, memPath);
  try { syncIndexes({ only: [leafDir] }); } catch { /* not yoksa indeks de yok */ }

  return { ws, leaf, leafDir, memPath, moved, already: false };
}

const args = process.argv.slice(2).filter((a) => a !== '--as');
const asIdx = process.argv.indexOf('--as');
const isCli = process.argv[1]?.endsWith('link-leaf.mjs');

if (isCli) {
  try {
    const r = linkLeaf(args[0], args[1], { as: asIdx > -1 ? process.argv[asIdx + 1] : null });
    if (r.already) { console.log(`= zaten bağlı: ${r.ws}/${r.leaf}`); process.exit(0); }
    console.log(`✓ ${resolve(args[1].startsWith('~/') ? join(process.env.HOME, args[1].slice(2)) : args[1])}`);
    console.log(`  ${r.memPath} → ${r.ws}/${r.leaf}${r.moved ? ` (${r.moved} dosya taşındı)` : ' (boş başladı)'}`);
  } catch (e) {
    console.error(`✗ ${e.message}`);
    process.exit(1);
  }
}
