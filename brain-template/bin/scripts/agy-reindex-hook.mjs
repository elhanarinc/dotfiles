// agy-reindex-hook.mjs — Antigravity PostToolUse hook'u.
// write_to_file, replace_file_content ve run_command çağrılarında vault içindeki
// Markdown değişikliklerini tespit edip indeksleri senkronize eder.
// Antigravity PostToolUse sözleşmesi gereği stdout'a {} basar.
import { basename, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyBacklinks,
  backlinkPlan,
  contextForCwd,
  leafForFile,
  noteWritesFromCommand,
  readHookInput,
  repairLinkFiles,
  syncIndexes,
  VAULT,
} from './lib.mjs';

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
      if (/^(?:TargetFile|target_file|file_?path|path|AbsolutePath)$/i.test(key) && typeof item === 'string') {
        out.push(item);
      } else {
        keyedPaths(item, out);
      }
    }
  }
  return out;
};

const ABSOLUTE_MARKDOWN = /\/(?:[^/\s"'`()\[\]{}]+\/)*[^/\s"'`()\[\]{}]+\.md\b/g;

const candidatesFromInput = (input) => {
  const args = input?.toolCall?.args || input?.tool_input || {};
  const found = new Set(keyedPaths(args));
  for (const raw of strings(args)) {
    const text = raw.replace(/\\r\\n|\\n|\\r/g, '\n');
    for (const target of noteWritesFromCommand(text)) found.add(target);
    for (const match of text.matchAll(ABSOLUTE_MARKDOWN)) found.add(match[0]);
  }
  return [...found];
};

const normalizePath = (candidate, cwd) => {
  const clean = String(candidate || '').trim().replace(/^['"`]|['"`]$/g, '');
  if (!clean) return null;
  if (clean.startsWith('~/')) return join(process.env.HOME, clean.slice(2));
  if (isAbsolute(clean)) return clean;
  for (const base of [cwd, VAULT].filter(Boolean)) {
    const cand = resolve(base, clean);
    if (leafForFile(cand)) return cand;
  }
  return resolve(cwd || process.cwd(), clean);
};

const main = async () => {
  const input = await readHookInput();
  const cwd = input?.workspacePaths?.[0] || input?.cwd || process.cwd();
  const context = contextForCwd(cwd);
  if (!context) {
    process.stdout.write('{}');
    return;
  }

  const dirs = new Set();
  const written = [];
  for (const candidate of candidatesFromInput(input)) {
    const path = normalizePath(candidate, cwd);
    const leaf = leafForFile(path);
    if (leaf && !leaf.isIndex) {
      dirs.add(leaf.dir);
      written.push([leaf.dir, basename(path)]);
    }
  }

  if (dirs.size) {
    for (const dir of dirs) syncIndexes({ only: [dir] });
    repairLinkFiles(written.map(([dir, file]) => join(dir, file)));
    const plan = [...dirs].flatMap((dir) =>
      backlinkPlan([{ dir }], written.filter(([d]) => d === dir).map(([, file]) => file))
    );
    applyBacklinks(plan, { log: join(VAULT, 'bin', 'state', 'backlink-auto.log'), append: true });
  }

  process.stdout.write('{}');
};

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) main().catch(() => process.stdout.write('{}')).finally(() => process.exit(0));
