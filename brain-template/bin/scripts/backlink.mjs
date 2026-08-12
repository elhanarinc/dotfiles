// Tek yönlü project↔project linklerine karşılık geri link ekler.
//
// NEDEN VAR: `oneWayLinks` (lib.mjs) yazma anında uyarıyor, ama o kontrol eklenmeden önce
// birikmiş 94 notluk bir borç vardı ve yeni kontrol yalnız DOKUNULAN notta ateşlendiği için
// bu birikim kendiliğinden yüzeye çıkmıyordu. Bu script birikmiş kısmı tek seferde kapatır.
//
// NE YAPAR: A notu B'ye link veriyor ama B vermiyorsa, B'nin sonundaki `İlgili:` satırına
// `[[A]]` ekler (satır yoksa açar). Vault'ta yerleşik konvansiyon bu. Frontmatter'a dokunmaz.
//
// NE YAPMAZ: hub notlarına (reference/feedback/user) geri link eklemez, hedefi olmayan
// linkleri onarmaz (o fixlinks.mjs'in işi), arşivli notlara dokunmaz.
//
// Vault git altında DEĞİL: --apply her çalışmada değiştirdiği dosyaların listesini
// bin/state/backlink-<zaman>.log dosyasına yazar, geri almak gerekirse oradan bakılır.
//
//   node bin/scripts/backlink.mjs          → sadece rapor
//   node bin/scripts/backlink.mjs --apply  → geri linkleri yaz
import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { VAULT, listLeafDirs, loadNotes, oneWayLinks, syncIndexes } from './lib.mjs';

const apply = process.argv.includes('--apply');
const RELATED = 'İlgili:';

// A'ya giden linki B'nin gövdesine ekler. Frontmatter'ın dışında kalması şart: notun
// sonundaki `İlgili:` satırı varsa ona eklenir, yoksa dosyanın sonuna yeni satır açılır.
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

// Modül olarak import edilince (testler) gövde ÇALIŞMAMALI: --apply argv'de olsaydı içe
// aktarmanın yan etkisi 89 nota yazmak olurdu.
const runDirectly = process.argv[1] && import.meta.filename === realpathSync(process.argv[1]);
if (!runDirectly) { /* sadece withBacklink dışa aktarılır */ } else main();

function main() {
const changes = [];
for (const leaf of listLeafDirs()) {
  const notes = loadNotes(leaf.dir);
  const byFile = new Map(notes.map((n) => [n.file, n]));

  for (const source of notes) {
    if (source.status === 'archived') continue;
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

// Aynı hedefe birden çok kaynak gelebilir; tek okuma-yazma turunda birleştir.
const byTarget = new Map();
for (const c of changes) {
  if (!byTarget.has(c.path)) byTarget.set(c.path, { ...c, sources: [] });
  byTarget.get(c.path).sources.push(c.sourceName);
}

const rel = (p) => p.replace(`${VAULT}/`, '');
for (const { path, sources } of byTarget.values()) {
  console.log(`${apply ? 'YAZILDI ' : 'eksik   '} ${rel(path)}  ←  ${sources.join(', ')}`);
}

if (apply && byTarget.size) {
  const touchedDirs = new Set();
  for (const { path, sources, dir } of byTarget.values()) {
    let text = readFileSync(path, 'utf8');
    for (const name of sources) text = withBacklink(text, name);
    writeFileSync(path, text);
    touchedDirs.add(dir);
  }
  const log = join(VAULT, 'bin', 'state', `backlink-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
  writeFileSync(log, [...byTarget.values()].map(({ path, sources }) => `${rel(path)} <- ${sources.join(', ')}`).join('\n') + '\n');
  syncIndexes({ only: [...touchedDirs] });
  console.log(`\n${byTarget.size} nota geri link yazıldı · log: ${rel(log)}`);
} else {
  console.log(`\n${byTarget.size} not geri link bekliyor` + (byTarget.size ? ' (--apply ile yaz)' : ''));
}
}
