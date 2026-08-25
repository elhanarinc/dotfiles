// Stop hook. Dolu bir oturum brain'e HİÇBİR ŞEY yazmadan kapanmasın diye TEK SEFER dürter.
//
// NEDEN VAR: kullanıcı 2026-08-25'te üçüncü kez "kapatırken braine kaydetmeyi unutma demem
// gerekiyor" dedi. Yazma kararı bugüne kadar tamamen modelin kendiliğinden hatırlamasına
// bağlıydı: capture.mjs kalıcı olanı seçmeyi BİLEREK reddediyor (dürüst sınır), inbox kaydı
// da oturum bittikten SONRA yazılıyor — yani dürtü olarak çok geç. Aradaki boşluk buydu.
//
// NİÇİN exit 2: Stop hook'unda exit 0 çıktısı yalnız debug log'una gidiyor — ne kullanıcı
// ne model görür (code.claude.com/docs/en/hooks). Modele ulaşan tek kanal exit 2 + stderr,
// o da "durma, bir tur daha çalış" demek. Dürtü ücretsiz değil; bu yüzden eşik yüksek ve
// oturum başına TEK SEFER.
//
// DÜRÜST SINIR — ZAMANLAMA: Stop her ASİSTAN TURUNUN sonunda ateşlenir, "oturumun sonunda"
// değil. Yani dürtü, oturum eşiği geçtikten sonraki ilk tur sınırında düşer; bu bazen işin
// ortasıdır. Mesaj bunu hesaba katıyor: henüz oturmamış bir şey varsa modelden tek satırla
// bunu söylemesi isteniyor, çünkü ikinci bir dürtü GELMEYECEK.
//
// Asla patlamaz: her hata yolunda exit 0 (hiçbir koşulda oturumu kilitlemez).
import { existsSync, mkdirSync, writeFileSync, writeSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { VAULT, readHookInput, workspaceForCwd, scanTranscript, shouldNudge } from './lib.mjs';

const MARK_DIR = join(VAULT, 'bin', 'state', 'nudged');

const main = async () => {
  const input = await readHookInput();

  // Kendi engellememizin tetiklediği turda TEKRAR engellemek döngü demek.
  if (input.stop_hook_active) return;

  // Hook global settings.json'da: makinedeki her projede ateşlenir. Tanımsız klasörler
  // (geçici dizinler, başkasının repoları) brain'in konusu değil.
  const ws = workspaceForCwd(input.cwd || '');
  if (!ws) return;

  const sid = input.session_id || '';
  if (!sid) return;
  const mark = join(MARK_DIR, `${sid}.txt`);
  if (existsSync(mark)) return; // bu oturumda zaten dürtüldü

  // İşaretçiler oturum başına bir küçük dosya; sınırsız birikmesin. 30 günden eskiler
  // gider — o oturumların transcript'i harness tarafından zaten temizlenmiş oluyor.
  try {
    const cutoff = Date.now() - 30 * 864e5;
    for (const f of readdirSync(MARK_DIR)) {
      const p = join(MARK_DIR, f);
      if (statSync(p).mtimeMs < cutoff) unlinkSync(p);
    }
  } catch { /* dizin yok ya da okunamıyor: dürtüyü engellemez */ }

  const scan = scanTranscript(input.transcript_path, input.cwd);
  if (!shouldNudge(scan)) return;

  // İşaretçi ÖNCE yazılır: aşağıdaki exit 2 yeni bir tur başlatıyor ve o turun sonunda Stop
  // yeniden ateşlenecek. İşaretçi o an yerinde değilse dürtü tekrarlar.
  try {
    mkdirSync(MARK_DIR, { recursive: true });
    writeFileSync(mark, `${new Date().toISOString()} ${ws} ${input.cwd || ''}\n`);
  } catch {
    return; // işaretçi yazılamıyorsa dürtme — döngü riskini almaktan iyidir
  }

  const ops = scan.ops.length ? `${scan.ops.length} mutasyon komutu` : null;
  const files = scan.files.length ? `${scan.files.length} dosya yazması` : null;
  const what = [ops, files].filter(Boolean).join(' + ');

  // writeSync: process.exit(2) hemen sonra geliyor, tamponlanmış stderr yazımı boru hattına
  // ulaşmadan süreç kapanabilir — dürtü sessizce kaybolur.
  writeSync(2,
    `brain: bu oturumda ${scan.prompts.length} prompt ve ${what} var, ama brain'e hiç not yazılmadı.\n`
    + 'Kalıcı bir şey çıktıysa ŞİMDİ yaz — karar, tercih, kısıt, ölçülmüş sayı, yanlış çıkan varsayım.\n'
    + `Nereye: ${VAULT.replace(process.env.HOME, '~')}/${ws}/<leaf>/<slug>.md · frontmatter'a `
    + '`index_title:` + `index_hook:` koy, MEMORY.md\'ye DOKUNMA (üretilen dosya).\n'
    + 'Önce ara, üzerine yaz: `node ' + VAULT.replace(process.env.HOME, '~') + '/bin/scripts/search.mjs "<konu>"`.\n'
    + 'Kalıcı bir şey YOKSA ya da henüz oturmadıysa tek satırla bunu söyle ve devam et — '
    + 'bu dürtü bu oturumda bir daha gelmeyecek.\n',
  );
  process.exit(2);
};

main().catch(() => {}).finally(() => process.exit(0));
