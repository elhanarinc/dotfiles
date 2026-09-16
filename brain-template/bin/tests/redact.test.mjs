// Secret redaksiyonu testleri.  node bin/tests/redact.test.mjs
//
// NEDEN VAR: capture.mjs kullanıcı promptlarını ve bash komutlarını inbox notuna yazıyor,
// ve vault bir GIT REPOSU. 2026-09-16 denetimi üç açık ölçtü — hepsi gerçek sızıntı yoluydu:
//   1. `AWS_SECRET_ACCESS_KEY=…` — eski kural `\b(secret|token|…)` ile başlıyordu, ama
//      `_SECRET` içinde SECRET'ın önündeki `_` kelime karakteri olduğu için `\b` tutmuyordu.
//   2. `mysql -pParola` — bitişik biçim, `\S+` gerektiren kurallara hiç uğramıyordu.
//   3. JWT (`eyJ…`) — hiçbir kural kapsamıyordu.
// Yanlış pozitif de aynı derecede önemli: her `-p` veya "token" geçen cümleyi redakte etmek
// inbox kaydını okunmaz yapar, yani kaydın kendisini öldürür.
// DİKKAT: aşağıdaki anahtarların HEPSİ sentetik fixture'dır (uydurma ya da satıcı dokümanındaki
// örnek değer). Gerçek kimlik bilgisi bu dosyaya ASLA girmemeli — testin amacı zaten sızıntıyı
// yakalamak. gitleaks iki satırı işaretliyor, ikisi de satır içi `gitleaks:allow` ile muaf.
import { redactSecrets } from '../scripts/lib.mjs';

let pass = 0;
const fails = [];
const t = (label, cond) => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${label}`);
  cond ? pass++ : fails.push(label);
};

// --- sızmamalı ---
for (const [n, s] of [
  ['AWS secret access key', 'export AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'],
  ['AWS access key id', 'AKIAIOSFODNN7EXAMPLE'],
  ['GitHub PAT', 'ghp_1234567890abcdefghijklmnopqrstuvwx'],
  ['Bearer başlığı', 'Authorization: Bearer sk-ant-api03-AAAAAAAAAAAAAAAAAAAA'],
  ['OpenAI anahtarı', 'OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz123456'],
  ['mysql bitişik -p', 'mysql -u root -pSuperGizli123! -h db'],
  ['mysqldump bitişik -p', 'mysqldump --single-transaction -h x -u r -pParola1 db'],
  ['Stripe canlı anahtar', 'STRIPE_SECRET_KEY=sk_live_51ABCdefGHIjklMNOpqrs'], // gitleaks:allow — sentetik fixture
  ['JWT', 'token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVP'], // gitleaks:allow — jwt.io örneği
  ['DB_PASSWORD (iki nokta)', 'DB_PASSWORD: hunter2hunter2'],
  ['Cloudflare token', 'CLOUDFLARE_API_TOKEN=abcDEF123ghiJKL456mnoPQR'],
  ['--password bayrağı', 'tool --password cokGizli'],
]) t(`sızmıyor: ${n}`, redactSecrets(s).includes('[REDACTED]'));

// --- yanlış pozitif olmamalı ---
for (const [n, s] of [
  ['düz Türkçe cümle', 'tokenlar hakkında konuştuk, parola yok'],
  ['kubectl -n', 'kubectl get pods -n prod'],
  ['mysql -p (ayrık, parola sorar)', 'mysql -u root -p  # parola sorar'],
  ['grep -p', 'grep -p desen dosya.txt'],
  ['sadece anahtar adı, değer yok', 'AWS_SECRET_ACCESS_KEY ortam değişkenini ayarla'],
]) t(`yanlış pozitif yok: ${n}`, !redactSecrets(s).includes('[REDACTED]'));

// --- idempotent: iki kez redakte etmek bozmamalı ---
const once = redactSecrets('OPENAI_API_KEY=sk-proj-abcdefghijklmnop');
t('idempotent', redactSecrets(once) === once);

console.log(`\n${pass} geçti, ${fails.length} düştü`);
if (fails.length) { console.log(fails.join('\n')); process.exit(1); }
