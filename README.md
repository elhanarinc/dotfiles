# dotfiles

Public, idempotent workstation bootstrap for a general-purpose Apple Silicon Mac. It installs shell and developer tooling, desktop applications, Claude Code, Codex, and an empty Obsidian living brain. Credentials, account state, Git identity, company configuration, project history, and existing Obsidian data are deliberately excluded.

## Quick start

Inspect first on an existing machine:

```bash
git clone https://github.com/elhanarinc/dotfiles.git ~/dotfiles
cd ~/dotfiles
./install.sh --dry-run
```

On a new Mac, after reviewing the plan:

```bash
./install.sh
```

Supported controls:

```bash
./install.sh --dry-run
./install.sh --only brew,shell,links
./install.sh --skip apps,brain
./install.sh --help
```

macOS arm64 is the primary supported platform. Linux shell setup remains best-effort; macOS applications are skipped there.

## What it manages

- Homebrew and CLI tools: Git/GitHub CLI, modern shell tools, tmux, Vim, Go, Node, Python/pyenv/uv, Ruby, Java 17, AWS CLI, kubectl, Helm, Terraform, media/document utilities, and formatters.
- Applications: Docker Desktop, VS Code, Ghostty, Chrome, Spotify, Slack, Obsidian, Postman, Lens, Caffeine, ChatGPT, Claude, iTerm2, and general desktop utilities.
- Shell: Oh My Zsh, autosuggestions, syntax highlighting, fzf-tab, you-should-use, Starship, NVM, TPM, and fzf integration.
- Allowlisted dotfile links with timestamped backups under `~/.dotfiles_backup/`.
- VS Code settings, MCP template, snippets, and extensions.
- Portable Claude/Codex defaults and living-brain hooks without authentication or trust state.
- A new, empty brain at `~/Obsidian/brain`; existing brain content is always preserved.

The installer never runs `brew bundle cleanup` and does not remove software or user data.

## Local-only configuration

The installer creates these files only when missing and never overwrites them:

- `~/.zshrc.local` from `.zshrc.local.example`: API keys, organization settings, and machine paths.
- `~/.gitconfig.local` from `.gitconfig.local.example`: name, email, signing keys, GitHub handle, and account-specific rewrites.

Claude/Codex login state, transcripts, caches, project trust, device state, cloud credentials, and application logins are not tracked. Authenticate manually after installation.

## Living brain

A plain-Markdown memory at `~/Obsidian/brain`, shared by Claude Code and Codex. The template carries the scripts and empty folders only — no notes, no workspace names, no machine paths.

```text
brain/
  <workspace>/     one folder per project, each with its own generated MEMORY.md
  archive/         notes dropped out of active context
  bin/scripts/     hooks and maintenance commands
  bin/state/       config.json (this machine) · inbox/ captures · tasks/ boards
  bin/docs/        living-brain manual
```

After installation, declare this machine's workspaces and attach repositories:

```bash
$EDITOR ~/Obsidian/brain/bin/state/config.json
node "$HOME/Obsidian/brain/bin/scripts/link-leaf.mjs" personal "$PWD"
```

`link-leaf.mjs` moves the harness's existing `memory/` folder into the vault and leaves a symlink behind, so nothing written before the brain existed is lost. Until `config.json` lists a root matching the current directory, every hook stays silent and writes nothing.

Session start prints the workspace's open tasks and the last unprocessed capture; session end records the session's prompts and touched files into `bin/state/inbox/`; writing a note regenerates that folder's `MEMORY.md` automatically. `MEMORY.md` is generated — set `index_title` / `index_hook` in a note's frontmatter instead of editing it. Full details in `brain-template/bin/docs/README.md`. Do not store secrets or raw transcripts.

Codex may require one interactive trust confirmation before local hooks run. The repository intentionally does not copy or fabricate machine-specific trust hashes.

## Verification and maintenance

Read-only checks:

```bash
./scripts/audit-public.sh
./scripts/inventory.sh
./scripts/doctor.sh
brew bundle check --file=Brewfile
```

Repository tests operate in temporary homes:

```bash
bash tests/run.sh
```

`brain-template/bin/scripts/` is kept byte-identical to the installed brain. After changing those scripts on a machine, pull them back in:

```bash
./scripts/sync-brain-template.sh           # report drift
./scripts/sync-brain-template.sh --apply   # copy the installed versions in
```

Before re-running on a customized existing Mac, use `./install.sh --dry-run`. Conflicting managed files are backed up before linking; local-only files and an existing brain are preserved.

## Post-install checklist

1. Edit `~/.gitconfig.local` and `~/.zshrc.local`.
2. Sign in to GitHub, cloud CLIs, Docker, Slack, Spotify, Claude, Codex, VS Code, and other applications as needed.
3. Open VS Code and install the `code` shell command if it is not already available, then run `./install.sh --only vscode`.
4. In tmux, press `prefix + I` to install plugins.
5. Fill `~/Obsidian/brain/bin/state/config.json`, then run `link-leaf.mjs` for each repository that should participate in the living brain.
6. Run `./scripts/doctor.sh` and resolve remaining warnings.

## Repository layout

```text
install.sh                 phase orchestrator
Brewfile                   Homebrew formulae and casks
scripts/                   install phases, audit, inventory, doctor, brain-template sync
config/claude/             portable Claude settings
config/codex/              portable Codex settings and agent contract
brain-template/            data-free living-brain software (bin/scripts, bin/state, bin/docs)
.config/                   VS Code, Ghostty, and Starship settings
tests/                     temporary-HOME behavior tests
AGENTS.md / CLAUDE.md      repository contribution rules
```

## Public-repository rule

Only reusable configuration belongs here. Run `scripts/audit-public.sh` before every push. Never commit credentials, real local override files, authentication data, project/company details, user-specific absolute paths, or Obsidian content.
