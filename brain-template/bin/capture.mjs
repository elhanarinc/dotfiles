#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { arg, brainDir, workspaceFor } from './lib.mjs';

const cwd = path.resolve(arg('--cwd', process.cwd()));
const source = arg('--source', 'agent');
const text = arg('--text', '').trim();
const match = workspaceFor(cwd);
if (!match) process.exit(0);
const [, item] = match;
const note = path.join(brainDir, item.note);
const entry = text || `Session completed by ${source}; add durable decisions and next steps here.`;
fs.appendFileSync(note, `\n## ${new Date().toISOString()} (${source})\n\n${entry}\n`);
