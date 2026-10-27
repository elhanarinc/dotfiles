// opencode-brief.mjs — OpenCode plugin'i için oturum başı brief + CLAUDE.md zinciri.
// buildContext({cwd, parentID}) düz metin döner; kapsam dışı cwd veya alt oturumda ''.
// CLI: stdin {"cwd","parentID"?} → stdout düz metin. Hata olursa sessizce boş.
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextForCwd, readHookInput } from './lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const NODE = process.execPath;
const PERSONAL_ROOT = join(process.env.HOME, 'Desktop', 'personal-projects');
const TOTAL_LIMIT = 6000; // ~1.5k token/çağrı; sahip onayı 2026-10-27 (16k = +6.4k token idi)
const HEADER = '## 🧠 brain (OpenCode oturum başı bağlamı — sessiz arka plan bilgisi)';
const CUT = '\n… (kısaltıldı)';

const clamp = (text, max) => (text.length <= max ? text : `${text.slice(0, Math.max(0, max - CUT.length))}${CUT}`);

const briefText = (cwd) => {
  const res = spawnSync(NODE, [join(HERE, 'codex-brief.mjs')], {
    input: JSON.stringify({ cwd }),
    encoding: 'utf8',
    timeout: 5000,
  });
  return res.status === 0 ? String(res.stdout || '').trim() : '';
};

// cwd'den personal-projects köküne kadar, kökten repoya doğru CLAUDE.md dosyaları.
const claudeChain = (cwd) => {
  const dirs = [];
  let cur = resolve(cwd);
  while (cur === PERSONAL_ROOT || cur.startsWith(`${PERSONAL_ROOT}/`)) {
    dirs.unshift(cur);
    if (cur === PERSONAL_ROOT) break;
    cur = dirname(cur);
  }
  const files = [];
  for (const dir of dirs) {
    const file = join(dir, 'CLAUDE.md');
    if (!existsSync(file)) continue;
    try { files.push({ file, body: readFileSync(file, 'utf8').trim() }); } catch { /* okunamayan atlanır */ }
  }
  return files;
};

export function buildContext({ cwd, parentID } = {}) {
  try {
    if (parentID || typeof cwd !== 'string' || !cwd) return '';
    if (!contextForCwd(cwd)) return '';
    const brief = clamp(briefText(cwd), 2000);
    const parts = [HEADER, '', brief];
    let remaining = TOTAL_LIMIT - parts.join('\n').length;
    const files = claudeChain(cwd);
    files.forEach(({ file, body }, i) => {
      // Adil pay: erken biten dosyanın artığı sonrakilere kalır; üst-ata her zaman önce gelir.
      const share = Math.floor(remaining / (files.length - i)) - file.length - 20;
      if (share < 200) return;
      const text = `\n\n### ${file}\n${clamp(body, share)}`;
      parts.push(text);
      remaining -= text.length;
    });
    return clamp(parts.join('\n').trim(), TOTAL_LIMIT);
  } catch {
    return '';
  }
}

const main = async () => {
  const input = await readHookInput();
  const text = buildContext({ cwd: input.cwd, parentID: input.parentID });
  if (text) process.stdout.write(text);
};

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) main().catch(() => {}).finally(() => process.exit(0));
