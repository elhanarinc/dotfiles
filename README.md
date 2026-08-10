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

The brain template contains scripts and empty folders, not this machine's notes. Register any repository after installation:

```bash
node "$HOME/Obsidian/brain/bin/register-project.mjs" "$PWD"
```

Agent hooks then load the matching workspace note at session start, capture a durable session marker at session end, and refresh the workspace index. Add useful decisions/current state/next steps to the workspace Markdown; do not store secrets or raw transcripts.

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

Before re-running on a customized existing Mac, use `./install.sh --dry-run`. Conflicting managed files are backed up before linking; local-only files and an existing brain are preserved.

## Post-install checklist

1. Edit `~/.gitconfig.local` and `~/.zshrc.local`.
2. Sign in to GitHub, cloud CLIs, Docker, Slack, Spotify, Claude, Codex, VS Code, and other applications as needed.
3. Open VS Code and install the `code` shell command if it is not already available, then run `./install.sh --only vscode`.
4. In tmux, press `prefix + I` to install plugins.
5. Register repositories that should participate in the living brain.
6. Run `./scripts/doctor.sh` and resolve remaining warnings.

## Repository layout

```text
install.sh                 phase orchestrator
Brewfile                   Homebrew formulae and casks
scripts/                   install phases, audit, inventory, doctor
config/claude/             portable Claude settings
config/codex/              portable Codex settings and agent contract
brain-template/            data-free living-brain software/template
.config/                   VS Code, Ghostty, and Starship settings
tests/                     temporary-HOME behavior tests
AGENTS.md / CLAUDE.md      repository contribution rules
```

## Public-repository rule

Only reusable configuration belongs here. Run `scripts/audit-public.sh` before every push. Never commit credentials, real local override files, authentication data, project/company details, user-specific absolute paths, or Obsidian content.
