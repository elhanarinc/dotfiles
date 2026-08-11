// TAM GERİ ALMA: vault'taki her memory klasörünü harness'ın kendi dizinine geri taşır
// ve symlink'leri kaldırır. Hook'ları KALDIRMAZ — onun için:
//   cp <scratchpad>/settings.json.bak ~/.claude/settings.json
// `--apply` verilmezse sadece planı basar.
//
// Not: `index_title:` / `index_hook:` frontmatter alanları ve üretilmiş MEMORY.md'ler
// olduğu gibi kalır — zararsızdır, ama elle yazılmış eski MEMORY.md biçimine dönmez.
import { readdirSync, existsSync, lstatSync, renameSync, unlinkSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';
import { VAULT, WORKSPACES } from './lib.mjs';

const PROJECTS = join(process.env.HOME, '.claude', 'projects');
const APPLY = process.argv.includes('--apply');

const plan = [];
for (const name of readdirSync(PROJECTS).sort()) {
  const memPath = join(PROJECTS, name, 'memory');
  if (!existsSync(memPath) || !lstatSync(memPath).isSymbolicLink()) continue;
  const target = readlinkSync(memPath);
  if (!target.startsWith(VAULT)) continue;
  plan.push({ memPath, target, name });
}

for (const p of plan) console.log(`${p.target.replace(VAULT, 'brain')}  →  ~/.claude/projects/${p.name}/memory`);
console.log(`\n${plan.length} klasör geri taşınacak`);

if (!APPLY) { console.log('(plan modu — uygulamak için --apply)'); process.exit(0); }

console.log('\n--- uygulanıyor ---');
for (const p of plan) {
  unlinkSync(p.memPath);
  renameSync(p.target, p.memPath);
  console.log(`✓ ${p.name}`);
}
// boşalan iş alanı klasörlerini temizle
for (const ws of WORKSPACES) {
  const dir = join(VAULT, ws);
  try { if (!readdirSync(dir).length) require('node:fs').rmdirSync(dir); } catch { /* dolu ya da yok */ }
}
console.log('\nHook\'lar hâlâ kurulu. Onları da kaldırmak için settings.json yedeğini geri yükle.');
