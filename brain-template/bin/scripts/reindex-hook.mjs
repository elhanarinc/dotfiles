// PostToolUse hook (matcher: Write|Edit).
//
// NEDEN VAR: 2026-08-10'da sistem tam buradan kırıldı. Bir oturum memory notunu doğru
// frontmatter'la yazdı ama `reindex.mjs` çalıştırmayı unuttu; not MEMORY.md'ye hiç girmedi,
// yani yazılmış olmasına rağmen hiçbir gelecek oturuma yüklenmeyecekti. İndeksin doğruluğu
// modelin bir komutu hatırlamasına bağlı olamaz — o iş bu hook'un.
//
// Vault dışındaki her yazma için sessizce çıkar. Asla patlamaz, asla engellemez.
import { basename } from 'node:path';
import { readHookInput, leafForFile, syncIndexes, oneWayLinks } from './lib.mjs';

const main = async () => {
  const input = await readHookInput();
  const file = input?.tool_input?.file_path;
  const leaf = leafForFile(file);
  if (!leaf) return; // vault'ta bir memory notu değil → bizi ilgilendirmiyor

  // MEMORY.md ÜRETİLEN bir dosya. Harness'ın kendi hafıza talimatı "MEMORY.md'ye bir satır
  // ekle" diyor; ona uyulursa o satır ilk reindex'te sessizce kaybolur. Sessizce kaybetmek
  // yerine modele söylüyoruz.
  if (leaf.isIndex) {
    syncIndexes({ only: [leaf.dir] });
    process.stdout.write(
      'UYARI: MEMORY.md üretilen bir dosya, elle düzenlenmez — frontmatter\'dan yeniden üretildi.\n' +
      'Bir satırı değiştirmek için ilgili NOTUN frontmatter\'ındaki `index_title:` / `index_hook:` alanını düzenle.\n',
    );
    return;
  }

  const { added } = syncIndexes({ only: [leaf.dir] });
  if (added.length) process.stdout.write(`brain: ${added.length} not indekse eklendi (otomatik).\n`);

  // Linkler indeks gibi otomatik onarılamaz (hangi notun geri link hak ettiği bir karar),
  // ama tek yönlü kalanı aynı turda söylemek elle hatırlatmaya gerek bırakmıyor.
  const oneWay = oneWayLinks(leaf.dir, basename(file));
  if (oneWay.length) {
    process.stdout.write(
      `brain: tek yönlü link — bu not ${oneWay.slice(0, 5).join(', ')} notuna link veriyor ama ` +
      'karşılığı yok.\nİlgili notlara geri linki ekle; bilinçli tek yönlüyse geç.\n',
    );
  }
};

main().catch(() => {}).finally(() => process.exit(0));
