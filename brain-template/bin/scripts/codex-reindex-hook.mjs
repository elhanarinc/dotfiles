// Codex PostToolUse hook. Direct file_path, patch metadata ve outer exec içindeki
// nested apply_patch yollarını çözer; yalnız vault'taki non-index Markdown notlarını eşitler.
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextForCwd, leafForFile, readHookInput, syncIndexes } from './lib.mjs';

const strings = (value, out = []) => {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const item of value) strings(item, out);
  else if (value && typeof value === 'object') for (const item of Object.values(value)) strings(item, out);
  return out;
};

const keyedPaths = (value, out = []) => {
  if (Array.isArray(value)) for (const item of value) keyedPaths(item, out);
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (/^(?:file_?path|path)$/i.test(key) && typeof item === 'string') out.push(item);
      else keyedPaths(item, out);
    }
  }
  return out;
};

const ABSOLUTE_MARKDOWN = /\/(?:[^/\s"'`()\[\]{}]+\/)*[^/\s"'`()\[\]{}]+\.md\b/g;
const PATCH_FILE = /^\*\*\* (?:Add|Update|Delete) File:\s*(.+\.md)\s*$/gm;

const candidatesFromInput = (input) => {
  const found = new Set(keyedPaths(input?.tool_input));
  for (const raw of strings(input?.tool_input)) {
    const text = raw.replace(/\\r\\n|\\n|\\r/g, '\n');
    if (!/apply_patch|\*\*\* (?:Add|Update|Delete) File:/.test(text)) continue;
    for (const match of text.matchAll(PATCH_FILE)) found.add(match[1].trim());
    for (const match of text.matchAll(ABSOLUTE_MARKDOWN)) found.add(match[0]);
  }
  return [...found];
};

const normalizePath = (candidate, cwd) => {
  const clean = String(candidate || '').trim().replace(/^['"`]|['"`]$/g, '');
  if (!clean) return null;
  if (clean.startsWith('~/')) return join(process.env.HOME, clean.slice(2));
  return isAbsolute(clean) ? clean : resolve(cwd || process.cwd(), clean);
};

const main = async () => {
  const input = await readHookInput();
  const context = contextForCwd(typeof input?.cwd === 'string' ? input.cwd : '');
  if (!context) return;

  const dirs = new Set();
  for (const candidate of candidatesFromInput(input)) {
    const path = normalizePath(candidate, input?.cwd);
    const leaf = leafForFile(path);
    if (leaf && !leaf.isIndex) dirs.add(leaf.dir);
  }
  for (const dir of dirs) syncIndexes({ only: [dir] });
};

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) main().catch(() => {}).finally(() => process.exit(0));
