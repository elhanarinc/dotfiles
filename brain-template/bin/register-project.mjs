#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { brainDir, readConfig, slug, writeConfig } from './lib.mjs';

const projectPath = path.resolve(process.argv[2] || process.cwd());
if (!fs.existsSync(projectPath)) { console.error(`Project does not exist: ${projectPath}`); process.exit(1); }
const config = readConfig();
const key = slug(projectPath);
config.workspaces ||= {};
config.workspaces[key] = { path: projectPath, note: `workspaces/${key}.md` };
writeConfig(config);
const note = path.join(brainDir, config.workspaces[key].note);
if (!fs.existsSync(note)) fs.writeFileSync(note, `# ${path.basename(projectPath)}\n\n## Context\n\n## Decisions\n\n## Current state\n\n## Next steps\n`);
console.log(`Registered ${key}: ${projectPath}`);
