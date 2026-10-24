#!/usr/bin/env node
// Read-only: compare the settings this repo would produce (template + private
// brain overlay, merged in memory) against the live ~/.claude/settings.json.
// Always exits 0; findings are reported, never fixed.
// Usage: claude-doctor.mjs [live-settings] [overlay]
// Env overrides: CLAUDE_DOCTOR_TEMPLATE, CLAUDE_DOCTOR_PLUGINS (plugin cache root).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyOverlay } from './claude-settings-merge.mjs';

const home = os.homedir();
const here = path.dirname(fileURLToPath(import.meta.url));
const livePath = process.argv[2] ?? path.join(home, '.claude/settings.json');
const overlayPath = process.argv[3] ?? path.join(home, 'Obsidian/brain/bin/state/claude-settings.overlay.json');
const templatePath = process.env.CLAUDE_DOCTOR_TEMPLATE ?? path.join(here, '../config/claude/settings.json');
const cacheRoot = process.env.CLAUDE_DOCTOR_PLUGINS ?? path.join(home, '.claude/plugins/cache');

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
let findings = 0;
const note = (msg) => { findings += 1; console.log(`[WARN] ${msg}`); };
const hint = (msg) => console.log(`       ${msg}`);

if (!fs.existsSync(livePath)) {
  console.log(`[INFO] no live settings at ${livePath}; nothing to compare`);
  process.exit(0);
}
let live;
let expected;
try {
  live = readJson(livePath);
  expected = readJson(templatePath);
  if (fs.existsSync(overlayPath)) applyOverlay(expected, readJson(overlayPath));
  else console.log('[INFO] no private overlay; comparing against the template only');
} catch (err) {
  console.log(`[WARN] cannot read settings: ${err.message}`);
  process.exit(0);
}

// Compare with $HOME expanded and shell quoting dropped, so "$HOME/x" and the expanded home path match.
const norm = (v) => JSON.stringify(v).split('$HOME').join(home).split('\\"').join('');
const same = (a, b) => norm(a) === norm(b);
const tilde = (s) => s.split(home).join('~');
// Keys Claude Code writes itself (install/survey state) are not configuration drift.
const harnessKeys = new Set(['installMethod', 'feedbackSurveyState', 'feedbackDrafts']);
const keys = (o) => Object.keys(o).filter((k) => k !== 'permissions' && !harnessKeys.has(k));

// 1. top-level keys (permissions are compared entry by entry below)
const onlyLive = keys(live).filter((k) => !(k in expected));
const onlyExpected = keys(expected).filter((k) => !(k in live));
const differing = keys(live).filter((k) => k in expected && !same(live[k], expected[k]));
if (onlyLive.length) note(`only in live: ${onlyLive.join(', ')}`);
if (onlyExpected.length) note(`only in expected (not applied yet): ${onlyExpected.join(', ')}`);
if (differing.length) note(`differs from expected: ${differing.join(', ')}`);

// 2. permission entries added locally (/config, "don't ask again")
for (const kind of ['allow', 'ask', 'deny']) {
  const exp = new Set(expected.permissions?.[kind] ?? []);
  const extra = (live.permissions?.[kind] ?? []).filter((e) => !exp.has(e));
  if (!extra.length) continue;
  note(`permissions.${kind}: ${extra.length} entr${extra.length === 1 ? 'y' : 'ies'} only in live`);
  for (const e of extra.slice(0, 5)) hint(e);
  if (extra.length > 5) hint(`... and ${extra.length - 5} more`);
}
if (findings && (live.permissions?.allow ?? []).some((e) => !(expected.permissions?.allow ?? []).includes(e))) {
  hint('hint: move wanted entries into the private overlay (or the template if generic), then drop them from live');
}

// 3. hook commands pointing at files that do not exist
const expand = (p) => p.replace(/\$\{?HOME\}?/g, home).replace(/^~(?=\/|$)/, home);
const missingHooks = new Set();
for (const groups of Object.values(live.hooks ?? {})) {
  for (const group of groups) {
    for (const h of group.hooks ?? []) {
      if (typeof h.command !== 'string') continue;
      for (const m of h.command.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)) {
        const tok = m[1] ?? m[2] ?? m[3];
        if (!/^(\/|~|\$\{?HOME\}?)/.test(tok)) continue;
        const file = expand(tok);
        if (!fs.existsSync(file)) missingHooks.add(file);
      }
    }
  }
}
for (const f of missingHooks) note(`hook path missing: ${tilde(f)}`);

// 4. enabled plugins that are not in the plugin cache
for (const [id, on] of Object.entries(live.enabledPlugins ?? {})) {
  if (on !== true) continue;
  const [name, market] = id.split('@');
  if (!market || !fs.existsSync(path.join(cacheRoot, market, name))) {
    note(`plugin enabled but not installed: ${id} (run: ./install.sh --only ai)`);
  }
}

console.log(findings === 0
  ? '[OK] claude settings match expected; hooks and plugins resolve'
  : `[INFO] claude-doctor: ${findings} finding(s)`);
process.exit(0);
