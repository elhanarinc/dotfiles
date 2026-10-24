#!/usr/bin/env node
// Merge a private settings overlay (machine/company-specific, kept outside this
// public repo) into ~/.claude/settings.json. Objects merge recursively, arrays
// are unioned, and `autoMode` is replaced wholesale so stale rules never linger.
// Re-running is idempotent.
// Usage: merge-claude-overlay.mjs [overlay] [target]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyOverlay } from './claude-settings-merge.mjs';

const home = os.homedir();
const overlayPath = process.argv[2] ?? path.join(home, 'Obsidian/brain/bin/state/claude-settings.overlay.json');
const targetPath = process.argv[3] ?? path.join(home, '.claude/settings.json');

if (!fs.existsSync(overlayPath)) {
  console.log(`[INFO] no overlay at ${overlayPath}; nothing to merge`);
  process.exit(0);
}

const overlay = JSON.parse(fs.readFileSync(overlayPath, 'utf8'));
const target = fs.existsSync(targetPath) ? JSON.parse(fs.readFileSync(targetPath, 'utf8')) : {};
applyOverlay(target, overlay);

const tmp = `${targetPath}.tmp-${process.pid}`;
fs.writeFileSync(tmp, `${JSON.stringify(target, null, 2)}\n`);
fs.renameSync(tmp, targetPath);
console.log(`[OK] merged ${Object.keys(overlay).join(', ')} into ${targetPath}`);
