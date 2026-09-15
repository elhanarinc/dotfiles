// PostToolUse hook (matcher: Write|Edit|Bash).
//
// NEDEN VAR: 2026-08-10'da sistem tam buradan kırıldı. Bir oturum memory notunu doğru
// frontmatter'la yazdı ama `reindex.mjs` çalıştırmayı unuttu; not MEMORY.md'ye hiç girmedi,
// yani yazılmış olmasına rağmen hiçbir gelecek oturuma yüklenmeyecekti. İndeksin doğruluğu
// modelin bir komutu hatırlamasına bağlı olamaz — o iş bu hook'un.
//
// Vault dışındaki her yazma için sessizce çıkar. Asla patlamaz, asla engellemez.
import { basename, join } from 'node:path';
import {
  readHookInput, leafForFile, syncIndexes, noteWriteLeaves,
  repairLinkFiles, backlinkPlan, applyBacklinks, VAULT,
} from './lib.mjs';

const AUTO_LOG = join(VAULT, 'bin', 'state', 'backlink-auto.log');

// Bir notun indeksini eşitle + linklerini ONAR + eksik geri linkleri YAZ.
//
// Bu fonksiyon bir dönem link sorunlarını yalnız BİLDİRİYORDU ("ilgili notlara geri
// linki ekle") ve düzeltme modelin o turda davranmasına bağlıydı. Pratikte davranmıyordu:
// bir denetimde 27 ölü link + 37 notluk geri link borcu birikmiş bulundu. Bildirim
// katmanı yanlış katmandı — ikisi de MEKANİK iş:
//   · link onarımı: hedef dosya adı ile slug'ın tire/alt çizgi farkı, TEK adaylıysa kesin,
//   · geri link: kural zaten project↔project + hedefi var olan linklere daraltılmış.
// Semantik karar gerektiren hiçbir şey otomatik değil; belirsiz link kasıtlı bırakılıyor.
const heal = (dirs, written) => {
  let added = 0;
  for (const dir of dirs) added += syncIndexes({ only: [dir] }).added.length;
  if (added) process.stdout.write(`brain: ${added} not indekse eklendi (otomatik).\n`);

  // 1 — yazılan notun ölü wikilinkleri (dosya adına göre onar, indeksi de eşitler)
  const repaired = repairLinkFiles(written.map(({ dir, file }) => join(dir, file)));
  if (repaired.length) {
    const shown = repaired.slice(0, 3).map((r) => `[[${r.from}]]→[[${r.to}]]`).join(', ');
    process.stdout.write(
      `brain: ${repaired.length} ölü link dosya adına göre onarıldı (otomatik): ${shown}` +
      `${repaired.length > 3 ? ' …' : ''}\n`,
    );
  }

  // 2 — karşılığı olmayan peer linkler için geri link YAZ (kaynak: yalnız bu turda yazılan not)
  const plan = [...dirs].flatMap((dir) =>
    backlinkPlan([{ dir }], written.filter((w) => w.dir === dir).map((w) => w.file)));
  const done = applyBacklinks(plan, { log: AUTO_LOG, append: true });
  if (done.size) {
    const names = [...done.values()].map((d) => d.target.replace(/\.md$/, ''));
    process.stdout.write(
      `brain: ${done.size} nota geri link yazıldı (otomatik): ${names.slice(0, 5).join(', ')}` +
      `${names.length > 5 ? ' …' : ''}\n` +
      'Bilinçli tek yönlüyse \'İlgili:\' satırından çıkar.\n',
    );
  }
};

const main = async () => {
  const input = await readHookInput();

  // --- Bash kolu. 2026-09-11'e kadar YOKTU ve delik buradaydı: matcher `Write|Edit` idi,
  // ama auto mode dosya yazmayı Bash'e yönlendiriyor. Auto-mode'da yazılan her brain notu
  // hook'u atlıyordu → MEMORY.md bayat kalıyor, o turda link bildirimi hiç gelmiyordu.
  // Tespit `lib.mjs`'te TEK yerde (`noteWritesFromCommand`), capture.mjs ve nudge.mjs ile
  // aynı fonksiyon — üç kopya tutmak bu sistemin tekrar tekrar kırıldığı desenin kendisi.
  if (input?.tool_name === 'Bash') {
    const written = noteWriteLeaves(input?.tool_input?.command, input?.cwd);
    if (!written.length) return;
    heal(new Set(written.map((w) => w.dir)), written);
    return;
  }

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

  heal([leaf.dir], [{ dir: leaf.dir, file: basename(file) }]);
};

main().catch(() => {}).finally(() => process.exit(0));
