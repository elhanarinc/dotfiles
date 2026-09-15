// SessionStart hook. stdout doğrudan context'e girer (10.000 karakter sınırı var).
// MEMORY.md zaten harness tarafından yükleniyor — burada ONU TEKRARLAMA.
// Buranın işi sadece durumsal olan: aktif projenin açık görevleri + işlenmemiş inbox.
// Asla patlamaz, asla yavaşlamaz: her hata sessizce yutulur, exit 0.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import {
  VAULT, TASK_DIR, INBOX_DIR, readHookInput, workspaceForCwd, syncIndexes, parseFrontmatter,
  auditLeaves, listLeafDirs, loadNotes, repairLinkFiles, backlinkPlan, applyBacklinks,
  unlinkedProjects,
} from './lib.mjs';
import { linkLeaf } from './link-leaf.mjs';

const LIMIT = 8000;
const AUTO_LOG = join(VAULT, 'bin', 'state', 'backlink-auto.log');

const main = async () => {
  const input = await readHookInput();
  const cwd = input.cwd || process.cwd();
  const ws = workspaceForCwd(cwd);
  const out = [];

  // Indeksi bu oturum için eşitle. Harness'ın MEMORY.md'yi bu hook'tan ÖNCE mi SONRA mı
  // okuduğu belirsiz — sıraya güvenmiyoruz: yeni giren satırları brief'in İÇİNE de yazıyoruz,
  // böylece bu oturum notu, yükleme sırası ne olursa olsun görür.
  let added = [];
  try { ({ added } = syncIndexes()); } catch { /* eşitlenemese bile brief çıksın */ }
  const mine = added.filter((a) => a.ws === ws);
  if (mine.length) {
    out.push(`### Indekse yeni giren ${mine.length} not (önceki oturumdan kalmış)`);
    out.push(...mine.slice(0, 10).map((a) => a.line));
    if (mine.length > 10) out.push(`- …+${mine.length - 10} tane daha`);
    out.push('');
  }

  // --- açık görevler: iş alanının panosu (config.json'daki isim), yoksa genel ---
  // Toplanıp SONRA basılıyor: "nerede kalmıştık" cevabı en üstte olsun.
  const taskLines = [];
  const candidates = [ws && join(TASK_DIR, `${ws}.md`), join(TASK_DIR, 'genel.md')].filter(Boolean);
  const taskFile = candidates.find(existsSync);
  if (taskFile) {
    const open = readFileSync(taskFile, 'utf8')
      .split('\n')
      .filter((l) => /^\s*-\s*\[ \]/.test(l))
      .map((l) => l.trim());
    if (open.length) {
      taskLines.push(`### Açık görevler — ${basename(taskFile, '.md')} (brain/bin/state/tasks/${basename(taskFile)})`);
      taskLines.push(...open.slice(0, 25).map((l) => l.replace(/^-\s*\[ \]\s*/, '- ')));
      if (open.length > 25) taskLines.push(`- …+${open.length - 25} tane daha`);
    }
  }

  // --- son oturum: "nerede kalmıştık" cevabı ---
  // Dosya adı (gün-sid) sıralaması aynı gün içinde işe yaramaz (sid rastgele) — mtime kullanılıyor.
  const wsInbox = ws && join(INBOX_DIR, ws);
  let pending = [];
  if (wsInbox && existsSync(wsInbox)) {
    pending = readdirSync(wsInbox)
      .filter((f) => f.endsWith('.md'))
      .map((f) => ({ f, path: join(wsInbox, f), t: statSync(join(wsInbox, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
  }

  if (pending.length) {
    const last = pending[0];
    const fm = parseFrontmatter(readFileSync(last.path, 'utf8'));
    // Eski (bu alanlar eklenmeden yazılmış) notlarda topic yok — gövdedeki ilk maddeye düş.
    let topic = fm.topic;
    if (!topic) {
      const m = readFileSync(last.path, 'utf8').match(/^## Ne konuşuldu[^\n]*\n- (.+)$/m);
      topic = m ? m[1].slice(0, 150) : '';
    }
    out.push(`### Son oturum — ${ws} · ${fm.date || last.f.slice(0, 10)} (${fm.project || '?'})`);
    if (topic) out.push(`Konu: ${topic}`);
    if (fm.touched) out.push(`Dokunulan: ${fm.touched}`);
    // Guard'lı: `ops` eklenmeden önce yazılmış inbox notlarında bu alan yok, satır düşer.
    if (fm.ops) out.push(`Çalıştırılan ops: ${fm.ops}`);
    if (fm.notes) out.push(`Yazılan not: ${fm.notes}`);
    out.push(`Devamı: \`brain/bin/state/inbox/${ws}/${last.f}\`${pending.length > 1 ? ` (+${pending.length - 1} eski)` : ''}`);
    out.push('Küratörlük: kalıcı olanı memory notuna işle, sonra dosyayı sil.');
    out.push('');
  }

  out.push(...taskLines);

  // --- bu iş alanının DİĞER hafıza klasörleri ---
  // Harness yalnızca cwd'nin kendi MEMORY.md'sini yükler. Kökte çalışırken alt projelerin
  // (ör. yoğun bir leaf'in 64 notu) hafızası görünmez; VAR OLDUĞUNU bilmezsem okumayı da denemem.
  // Bu satır o körlüğü kapatıyor: nerede olduklarını ve nasıl okunacağını söyler.
  try {
    // DİKKAT: leaf'in vault yolu (brain/personal/_kok) asla cwd'ye eşit olmaz — karşılaştırılacak
    // olan leaf'in GERÇEK proje yolu (auditLeaves bunu harness klasör adından çözüyor).
    const others = auditLeaves()
      .filter((r) => r.leaf.split('/')[0] === ws && r.realPath !== cwd && r.notes)
      .map((r) => `${r.leaf.split('/').slice(1).join('/')}(${r.notes})`);
    if (others.length) {
      out.push('', `### ${ws} iş alanının diğer hafıza klasörleri — otomatik YÜKLENMEZ`);
      out.push(others.join(', '));
      out.push(`O dizinde oturum açılınca yüklenir; buradan okumak için: \`brain/${ws}/<ad>/MEMORY.md\``);
    }
  } catch { /* körlük uyarısı verilemese bile brief çıksın */ }

  // --- öz onarım: mekanik olanı BİLDİRMEK yerine KAPAT ---
  // PostToolUse hook'u yalnız AJANIN yazdığı notta ateşleniyor; Obsidian'da elle düzenlenen
  // ya da başka yoldan gelen notların ölü linki/asimetrisi hiçbir yerde görünmüyordu. Borç
  // 2026-08-12'de bir kez sıfırlandı, buraya da bir SAYAÇ kondu — ama sayaç kapatmıyor:
  // 2026-09-15 denetiminde yine 27 ölü link + 37 notluk borç birikmiş bulundu ve kullanıcı
  // haklı olarak "durup durup düzelt demek istemiyorum" dedi. Artık aynı tarama düzeltmeyi
  // de yazıyor; basılan şey borç değil YAPILAN İŞ, ve iş yoksa hiçbir satır basılmıyor
  // (SessionStart stdout'u context bütçesi — boş gürültü oraya giremez).
  // Maliyet: iş alanının notlarını bir kez okumak + vault link indeksi; ölçülen ~250ms.
  try {
    const leaves = listLeafDirs().filter((l) => l.ws === ws);
    const repaired = repairLinkFiles(leaves.flatMap((l) => loadNotes(l.dir).map((n) => join(l.dir, n.file))));
    const linked = applyBacklinks(backlinkPlan(leaves), { log: AUTO_LOG, append: true });
    const did = [
      repaired.length ? `${repaired.length} ölü link onarıldı` : null,
      linked.size ? `${linked.size} nota geri link yazıldı` : null,
    ].filter(Boolean);
    if (did.length) {
      out.push('', `### brain öz onarım (otomatik): ${did.join(' · ')}`);
      out.push('Bilinçli tek yönlü bir link ezildiyse ilgili notun `İlgili:` satırından çıkar.');
    }
  } catch { /* onarım yapılamasa bile brief çıksın */ }

  // --- iş alanı içinde bağlanmamış BOŞ proje: bağla ---
  // Harness her cwd için boş bir memory/ açar. Kapsam dışındaysa zararsız, ama bir iş alanı
  // kökünün İÇİNDEYSE bu bağlanmamış gerçek bir projedir: o dizinde açılan oturum boş hafıza
  // yükler ve orada yazılan not vault'a hiç girmez (bir denetimde 3 tane bulundu, biri
  // haftalardır sessizce boş kalmış gerçek bir proje). Yalnız BOŞ olanı bağlıyoruz:
  // notu olan yetim klasör dosya taşımak demek, çakışma üretebilir, o karar kullanıcının.
  try {
    const linkedLeaves = [];
    for (const p of unlinkedProjects()) {
      if (p.ws !== ws || p.notes) continue;
      try { linkedLeaves.push(linkLeaf(p.ws, p.real).leaf); } catch { /* çakışma → verify bildirir */ }
    }
    if (linkedLeaves.length) {
      out.push('', `### brain: ${linkedLeaves.length} bağlanmamış proje vault'a bağlandı — ${linkedLeaves.join(', ')}`);
    }
  } catch { /* bağlanamasa bile brief çıksın */ }

  if (!out.length) return;

  out.unshift(
    `## 🧠 brain (${VAULT})`,
    'Memory indeksi zaten yüklü. Yeni bir memory notu yazarken MEMORY.md\'yi ELLE DÜZENLEME —',
    'notun frontmatter\'ına `index_title:` + `index_hook:` koyman yeterli; indeksleme otomatik.',
    '',
  );

  let text = out.join('\n');
  if (text.length > LIMIT) text = `${text.slice(0, LIMIT)}\n… (kırpıldı)`;
  process.stdout.write(text);
};

main().catch(() => {}).finally(() => process.exit(0));
