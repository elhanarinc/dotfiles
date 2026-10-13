#!/usr/bin/env node
// PostToolUse(Edit|Write) tip kontrolü.
//
// NEDEN YENİDEN YAZILDI (2026-09-16 denetimi, üç ayrı arıza ölçüldü):
//  1. Eski hook `npx tsc --noEmit` çağırıyordu. Vite/React şablonundaki `tsconfig.json`
//     `{"files": [], "references": [...]}` — yani `tsc --noEmit` SIFIR dosya kontrol ediyor.
//     `--listFiles | grep src` = 0 satır. pokemon-pack-opening ve burcu-website'te tip
//     kontrolü HİÇ ÇALIŞMIYORDU, ama 0,6 sn sürüp sessiz çıktığı için çalışıyor sanılıyordu.
//  2. PostToolUse'da DÜZ stdout Claude'a gitmiyor, yalnız debug log'una yazılıyor
//     (resmî dokümandaki tablo). Yani hata bulsa bile bana ulaşmıyordu. Artık çıktı
//     `hookSpecificOutput.additionalContext` ile JSON olarak veriliyor — PostToolUse bunu
//     onurlandıran olaylardan biri.
//  3. Uzantı kapısı yoktu: bir .md notu yazmak bile tam tip kontrolü tetikliyordu.
//
// Ayrıca `npx` KULLANILMIYOR: yerel tsc yoksa sessizce çıkıyoruz. `npx tsc` paketi
// bulamazsa AĞDAN İNDİRMEYE kalkar — bir hook'un yapabileceği en kötü şey.
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve, extname } from 'node:path';

const TS_EXT = new Set(['.ts', '.tsx', '.mts', '.cts']);
const BUDGET_MS = 55_000;
const out = (o) => process.stdout.write(JSON.stringify(o));

const readStdin = () => new Promise((r) => {
  let d = ''; let done = false;
  const fin = () => { if (!done) { done = true; clearTimeout(t); process.stdin.destroy(); try { r(JSON.parse(d || '{}')); } catch { r({}); } } };
  const t = setTimeout(fin, 300);
  process.stdin.on('data', (c) => { d += c; }).on('end', fin).on('error', fin);
});

const stripJsonc = (t) => t
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:"])\/\/.*$/gm, '$1')
  .replace(/,(\s*[}\]])/g, '$1');

// Düzenlenen dosyadan yukarı doğru en yakın tsconfig.json'ı ara. $HOME'da dur:
// sınırsız yukarı yürümek kapsam dışı bir repoyu kontrol ettirebilir.
const findRoot = (start) => {
  let d = start;
  const stop = process.env.HOME || '/';
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(d, 'tsconfig.json'))) return d;
    const up = dirname(d);
    if (up === d || d === stop) break;
    d = up;
  }
  return null;
};

const main = async () => {
  const input = await readStdin();
  const file = input?.tool_input?.file_path;
  if (!file || !TS_EXT.has(extname(file))) return;            // kapı 1: sadece TS dosyaları

  const root = findRoot(dirname(resolve(file)));
  if (!root) return;                                           // kapı 2: TS projesi değil

  const tsc = join(root, 'node_modules', '.bin', 'tsc');
  if (!existsSync(tsc)) return;                                // kapı 3: yerel tsc yok → npx YOK

  // Referans-stili kök (`files: []` + `references`) `--noEmit` ile hiçbir şey kontrol etmez;
  // doğru çağrı `-b`. Normal kökte `--noEmit` doğru çağrı.
  let args = ['--noEmit'];
  try {
    const cfg = JSON.parse(stripJsonc(readFileSync(join(root, 'tsconfig.json'), 'utf8')));
    if (Array.isArray(cfg.references) && cfg.references.length
        && Array.isArray(cfg.files) && !cfg.files.length) args = ['-b'];
  } catch { /* okunamıyorsa --noEmit ile dene */ }

  try {
    execFileSync(tsc, args, { cwd: root, encoding: 'utf8', timeout: BUDGET_MS, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    if (e.killed || e.signal) return;                          // timeout → sessiz, iş bloklanmaz
    const text = `${e.stdout || ''}${e.stderr || ''}`.trim();
    if (!text) return;
    const lines = text.split('\n').filter((l) => /error TS\d+/.test(l));
    if (!lines.length) return;
    out({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: `tsc (${root}, \`tsc ${args.join(' ')}\`) ${lines.length} tip hatası buldu:\n`
          + `${lines.slice(0, 20).join('\n')}${lines.length > 20 ? `\n… +${lines.length - 20} tane daha` : ''}`,
      },
    });
  }
};

main().catch(() => {}).finally(() => process.exit(0));
