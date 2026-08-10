import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const brainDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const configPath = path.join(brainDir, 'config.json');
export function readConfig() { return JSON.parse(fs.readFileSync(configPath, 'utf8')); }
export function writeConfig(value) { fs.writeFileSync(configPath, `${JSON.stringify(value, null, 2)}\n`); }
export function arg(name, fallback = '') { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : fallback; }
export function slug(value) { return path.basename(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project'; }
export function workspaceFor(cwd) {
  const entries = Object.entries(readConfig().workspaces || {}).sort((a, b) => b[1].path.length - a[1].path.length);
  return entries.find(([, item]) => cwd === item.path || cwd.startsWith(`${item.path}${path.sep}`));
}
