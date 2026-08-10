#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { brainDir, readConfig } from './lib.mjs';

const config = readConfig();
const lines = ['# Workspace Index', ''];
for (const [key, item] of Object.entries(config.workspaces || {}).sort()) lines.push(`- [${key}](${item.note}) — \`${item.path}\``);
fs.writeFileSync(path.join(brainDir, 'index.md'), `${lines.join('\n')}\n`);
if (!process.argv.includes('--quiet')) console.log(`Indexed ${lines.length - 2} workspace(s)`);
