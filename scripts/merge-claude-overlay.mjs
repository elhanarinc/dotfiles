#!/usr/bin/env node
// Merge a private settings overlay (machine/company-specific, kept outside this
// public repo) into ~/.claude/settings.json. Objects merge recursively, arrays
// are unioned, and `autoMode` is replaced wholesale so stale rules never linger.
// Re-running is idempotent.
// Usage: merge-claude-overlay.mjs [overlay] [target]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const home = os.homedir();
const overlayPath = process.argv[2] ?? path.join(home, 'Obsidian/brain/bin/state/claude-settings.overlay.json');
const targetPath = process.argv[3] ?? path.join(home, '.claude/settings.json');

if (!fs.existsSync(overlayPath)) {
  console.log(`[INFO] no overlay at ${overlayPath}; nothing to merge`);
  process.exit(0);
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function merge(target, overlay) {
  for (const [key, value] of Object.entries(overlay)) {
    if (Array.isArray(value) && Array.isArray(target[key])) {
      target[key] = [...target[key], ...value.filter((v) => !target[key].includes(v))];
    } else if (isObject(value) && isObject(target[key])) {
      merge(target[key], value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

const overlay = JSON.parse(fs.readFileSync(overlayPath, 'utf8'));
const target = fs.existsSync(targetPath) ? JSON.parse(fs.readFileSync(targetPath, 'utf8')) : {};
const { autoMode, ...rest } = overlay;
merge(target, rest);
if (autoMode) target.autoMode = autoMode;

const tmp = `${targetPath}.tmp-${process.pid}`;
fs.writeFileSync(tmp, `${JSON.stringify(target, null, 2)}\n`);
fs.renameSync(tmp, targetPath);
console.log(`[OK] merged ${Object.keys(overlay).join(', ')} into ${targetPath}`);
