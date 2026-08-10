#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { arg, brainDir, workspaceFor } from './lib.mjs';

const cwd = path.resolve(arg('--cwd', process.cwd()));
const match = workspaceFor(cwd);
if (!match) { console.log(`Living brain: project not registered. Run register-project.mjs "${cwd}"`); process.exit(0); }
const [key, item] = match;
const note = path.join(brainDir, item.note);
console.log(`Living brain context: ${key}\n${fs.existsSync(note) ? fs.readFileSync(note, 'utf8') : '(empty)'}`);
