# macOS Workstation Bootstrap Design

Date: 2026-08-11

## Goal

Turn this public dotfiles repository into the first repository installed on a new Apple Silicon
Mac. A single idempotent bootstrap should reproduce the user's general development workstation:
shell, terminal, editors, runtimes, command-line tools, desktop applications, Claude Code, Codex,
and an empty Obsidian living-brain system.

The bootstrap must reproduce configuration and tooling, not identity or historical data. It must
never publish credentials, authentication state, private-company configuration, project history,
existing Obsidian notes, Claude/Codex transcripts, or machine identifiers.

## Target Platforms

- Primary and fully supported: macOS on Apple Silicon (`Darwin`, `arm64`).
- Existing Linux support remains best-effort and must not regress, but it is not required to install
  macOS desktop applications or reproduce the complete workstation.
- Intel macOS is not a supported target for the new full-workstation contract. Existing Homebrew
  prefix detection may remain for compatibility.

## Current State and Drift

The repository is clean at commit `29837d7` and matches `origin/master`. The live shell, Git, Vim,
Readline, tmux, Bash, Starship, and Ghostty files are already symlinked to this repository, so there
is no hidden content diff for those files.

The meaningful drift is elsewhere:

- The Brewfile contains the core CLI stack but omits many applications used on the current Mac,
  including Docker Desktop, Chrome, Spotify, Slack, Obsidian, Postman, Lens, Caffeine, ChatGPT,
  Claude, and several public utility applications.
- Claude Code is installed at `~/.local/bin/claude`, while Codex is installed as the Homebrew cask
  `codex`. Their safe configuration is not represented in the repository.
- Live VS Code settings are regular files, not symlinks. The useful drift includes
  `git.ignoreRebaseWarning`; machine-generated survey timestamps must not be imported.
- The current Obsidian living brain exists outside the repository and contains private data. Only
  its generic software structure and scripts may be converted into a data-free template.

## Design Principles

### Public by construction

Tracked files must be safe to publish without a final manual secret-cleaning step. Installation
logic uses an allowlist of files and settings rather than copying entire live configuration trees.
The repository must reject obvious credential material with a deterministic audit command.

### Idempotent and recoverable

Running `install.sh` repeatedly must converge on the same state. Existing files that would be
replaced are moved into a timestamped `~/.dotfiles_backup/` directory. Package installation uses
Homebrew's convergent bundle behavior. Scripts do not delete user data.

### One command, observable phases

`install.sh` is the public entry point. It runs named phases, prints a concise result per phase, and
finishes with a doctor summary showing success, warnings, skipped manual steps, and failures.

### Configuration, not authentication

The bootstrap installs and configures applications but never attempts to restore logins. GitHub,
AWS, cloud providers, Docker registries, Slack, Spotify, Claude, Codex, VS Code sync, and similar
services require an explicit post-install login by the user.

### General workstation only

AppSamurai-, Storyly-, Netvent-, or other employer-specific paths, modules, accounts, clusters,
plugins, and project trust entries are excluded. General professional tools such as AWS CLI,
kubectl, Helm, Terraform, and Docker remain part of the default workstation.

## Repository Architecture

```text
dotfiles/
  install.sh                    main phase orchestrator
  Brewfile                      CLI, runtime, font, and GUI package manifest
  scripts/
    lib.sh                      logging, OS checks, backups, command helpers
    install-shell.sh            Oh My Zsh, plugins, Starship, NVM, tmux/fzf
    install-dev-tools.sh        language helpers and VS Code extensions
    install-ai-tools.sh         Claude Code and Codex public-safe setup
    install-brain.sh            empty Obsidian brain installation
    link-dotfiles.sh            allowlisted backup-and-symlink operations
    doctor.sh                   read-only post-install validation
    audit-public.sh             tracked-file credential and personal-data checks
    inventory.sh                read-only local-vs-repo drift report
  config/
    claude/settings.json        sanitized Claude defaults and brain hooks
    codex/config.toml           portable Codex defaults only
    codex/hooks.json            direct brain SessionStart/End/PostToolUse hooks
    codex/AGENTS.md             living-brain operating contract
  brain-template/
    README.md                   empty brain usage and project registration
    bin/                        generic brain scripts
    tasks/general.md            empty task board
    inbox/.gitkeep
    archive/.gitkeep
    workspaces/.gitkeep
  tests/
    install.bats                phase/idempotency tests where practical
    fixtures/                   isolated fake-HOME test inputs
  docs/
    workstation.md              installed components and post-install logins
```

The exact split may be reduced during implementation if a module contains only trivial forwarding,
but `install.sh` must not grow into one monolithic file with every responsibility embedded in it.

## Installation Interface

Default:

```sh
./install.sh
```

Supported controls:

```sh
./install.sh --dry-run
./install.sh --only brew,apps,shell,links,vscode,ai,brain,doctor
./install.sh --skip apps,brain
./install.sh --help
```

Rules:

- `--dry-run` performs discovery and prints planned mutations without installing, moving, or
  linking files.
- `--only` runs only the comma-separated named phases plus prerequisite detection.
- `--skip` removes named phases from the default run.
- Unknown phase names are fatal and print the valid list.
- A phase failure is recorded. Independent later phases may continue when safe, but the final exit
  code is non-zero if any required phase failed.
- Commands requiring interactive system authorization announce it immediately before invoking it.

## Package and Application Inventory

The existing Brewfile remains the single package manifest. Implementation will reconcile it with
the live machine and group entries by purpose.

Required desktop applications include:

- Docker Desktop
- Visual Studio Code
- Ghostty
- Google Chrome
- Spotify
- Slack
- Obsidian
- Postman
- Lens
- Caffeine
- ChatGPT
- Claude desktop

Current public utility applications should be included when a stable Homebrew cask exists and they
are general-purpose: iTerm2, Maccy, Ice/HiddenBar equivalent, TablePlus/TablePro equivalent,
React Native Debugger, Android Platform Tools, and the existing Nerd Fonts. The implementation must
verify current cask tokens before changing the Brewfile. Applications without a stable official or
Homebrew installation route belong in the post-install manual checklist, not an unverified download
script.

The existing core CLI/runtime set remains, including Git/GitHub CLI, modern shell utilities, tmux,
Vim, Go, Python/pyenv/uv, Node/NVM, Java 17, Ruby, AWS CLI, kubectl, Helm, Terraform, MySQL client,
and general media/document utilities that are already intentionally installed.

`brew bundle cleanup` is never run automatically because removing unlisted software is destructive.

## Shell and Symlink Behavior

The current allowlisted symlink model remains authoritative. The installer links only known public
configuration files. It never recursively symlinks an entire home configuration directory.

Before replacing a destination:

1. If it is already the exact expected symlink, do nothing.
2. If it exists and differs, move it to the current timestamped backup directory.
3. Create the parent directory.
4. Create the symlink.
5. Verify the final resolved target.

Machine-local values live only in ignored files such as `~/.zshrc.local`. The tracked example may
contain variable names and explanatory placeholders, never real values or company-specific paths.

Git identity is also machine-local. The public `.gitconfig` contains reusable aliases, diff, merge,
and editor behavior only; `user.name`, `user.email`, signing keys, credential helpers with account
identifiers, and employer-specific URL rewrites move to an ignored `~/.gitconfig.local` created from
a placeholder example. The public config conditionally includes that local file.

## VS Code

The repository continues to track an allowlisted user settings file, MCP registration template,
snippets, and extension list.

Sync policy:

- Merge stable user choices from the live file, such as `git.ignoreRebaseWarning`.
- Exclude survey timestamps, prompt counters, generated cache values, recent-project history,
  account state, Copilot tokens, and machine paths.
- MCP configuration may contain command names and `${env:VARIABLE}` references only. Hard-coded
  tokens, filesystem credentials, or employer-specific servers are forbidden.
- Extension installation remains idempotent and reports extensions that could not be installed.

## Claude Code

Claude Code is installed through its current official installation method, verified during
implementation. The tracked configuration contains only portable defaults and generic brain hooks.

Excluded:

- login/auth state;
- history and transcripts;
- project memory data;
- plugin caches and marketplace snapshots;
- device/UI state;
- status-line paths tied to a versioned local cache;
- employer-specific permissions or project settings.

Installed configuration must merge or back up an existing `~/.claude/settings.json`; it must not
silently overwrite an authenticated, already-configured machine. The generic brain hooks use paths
under `$HOME/Obsidian/brain` and a stable Node executable resolved by the installer.

## Codex

Codex CLI is installed through its current official Homebrew cask. The repository tracks:

- portable model/personality defaults that do not expose account state;
- direct `~/.codex/hooks.json` brain hooks;
- the global `~/.codex/AGENTS.md` living-brain contract.

Excluded:

- `auth.json` and tokens;
- project trust entries with absolute local repository paths;
- plugin cache revisions and install timestamps;
- hook trust hashes generated for a different machine;
- MCP secrets, device paths, local app bundle paths, and session databases;
- histories, memories, logs, goals, queues, and rollouts.

On a new machine, Codex discovers the direct hooks and asks the user to trust the exact commands.
The doctor reports untrusted hooks as an explicit post-install action rather than bypassing trust or
writing fabricated hashes.

## Empty Obsidian Living Brain

`brain-template/` contains software and empty structure only. No current note, task, inbox record,
archive, generated project index, session reference, personal profile, or project name is copied.

Installation creates `~/Obsidian/brain` non-destructively:

- If absent, copy the empty template and initialize its generic directories.
- If present, never replace or merge user notes automatically; install/update only versioned script
  files after showing the plan and backing up changed script versions.
- Create an Obsidian-compatible vault configuration only when it contains no user/device workspace
  state.

The template must support generic project registration instead of hard-coded current workspaces.
A command such as:

```sh
node ~/Obsidian/brain/bin/register-project.mjs ~/Desktop/projects/example personal/example
```

creates the leaf, empty generated index source area, task routing metadata, and Claude harness
symlink when the corresponding harness directory exists. Registration is explicit and reversible.

The empty brain preserves these concepts:

- project-scoped leaf notes and generated `MEMORY.md` indexes;
- workspace task boards;
- SessionStart brief;
- SessionEnd inbox capture;
- automatic reindexing;
- archive and verification commands;
- direct Claude and Codex integration.

It does not preserve any current brain content.

## Public Repository Safety

The tracked `.gitignore` will cover at minimum:

- `.env*` except explicit examples;
- `*.local` and local shell overrides;
- credential/key/certificate files;
- Claude/Codex auth, histories, memories, logs, sessions, caches, and database files;
- Obsidian vault data outside the explicit empty template;
- generated backups and installer reports containing local paths;
- Brew lock files and OS metadata.

`scripts/audit-public.sh` scans tracked content, not the entire home directory. It fails on likely
secrets, private keys, bearer tokens, credential URLs, and known auth filenames. It also checks for
hard-coded `/Users/<name>` paths, personal email addresses, Git identity, and excluded employer names.
Allowlisted documentation examples must use placeholders such as `$HOME`, `${VAR}`, or
`/Users/example`. Existing tracked SSH aliases and Git URL rewrites must be reviewed and generalized
or moved to ignored local examples during the one-time sync.

The audit is defense in depth, not authorization to commit secrets. Every file added from live
configuration must still be manually understood and allowlisted.

## Inventory and Sync Workflow

`scripts/inventory.sh` is read-only and reports:

- tracked symlink destinations and whether they resolve correctly;
- Brew formula/cask drift;
- installed applications not represented by the manifest;
- VS Code settings and extension drift after filtering generated keys;
- Claude/Codex installed versions and presence of safe configuration surfaces;
- missing bootstrap components;
- files intentionally excluded as sensitive or historical.

It never copies files. Sync is an explicit implementation change informed by its report.

For this migration, current live state is reconciled once using the same allowlist rules. Shell
files already linked to the repository remain unchanged unless a specific defect is found.

## Doctor and Verification

`scripts/doctor.sh` is read-only and checks:

- supported OS/architecture and Homebrew;
- required formulae/casks and applications;
- expected symlink targets;
- Oh My Zsh plugins, NVM, Starship, tmux plugin manager, and language runtimes;
- VS Code CLI and extension baseline;
- Claude and Codex executables;
- existence and parseability of their sanitized configs and hook commands;
- empty brain scripts, task board, hook routing, reindexing, and scope silence;
- public audit result.

Tests use a temporary fake home directory and mock package commands where mutations would otherwise
touch the real machine. At minimum they cover argument parsing, dry-run no-mutation, backup/link
idempotency, public audit fixtures, safe config merge behavior, empty brain creation, and a second
installer run producing no new backup.

The real-machine validation sequence is:

```sh
./install.sh --dry-run
./scripts/audit-public.sh
./scripts/doctor.sh
brew bundle check --file=./Brewfile
```

The implementation must not run the full installer against the current Mac until dry-run output is
reviewed. Targeted safe phases may be tested individually.

## Error Handling and Rollback

- Package failures are summarized with the failed token and retry command.
- An unavailable optional GUI application becomes a warning and manual step; a missing required
  shell/runtime dependency fails the run.
- A config parse failure stops that configuration phase before linking it.
- Backups are never automatically deleted.
- Rollback consists of restoring files from the printed backup directory and removing only symlinks
  created by the installer.
- Existing Obsidian vaults, authenticated Claude/Codex state, SSH material, and project directories
  are never deleted or reset.

## Documentation

The README becomes the short entry point: prerequisites, clone command, `./install.sh`, phase flags,
what is installed, public-safety promise, and post-install logins.

`docs/workstation.md` contains the complete package/application inventory, configuration ownership,
manual logins, optional tools, doctor usage, and rollback.

The repository will include `AGENTS.md` aligned with the existing `CLAUDE.md`: inspect first,
Conventional Commits, never commit credentials, use public-safe templates, and validate installer
changes with dry-run/audit/doctor tests.

## Acceptance Criteria

The feature is complete when:

- A clean Apple Silicon macOS test environment can run the bootstrap from the public repository.
- A second run is idempotent and does not create unnecessary backups or duplicate configuration.
- Required CLI tools, runtimes, fonts, editors, terminals, and named desktop applications are
  installed or precisely reported as manual exceptions.
- Shell, Ghostty, tmux, Starship, Vim, Git, and VS Code configuration resolves to tracked public-safe
  files.
- Claude Code and Codex are installed and receive generic living-brain hooks without credentials or
  historical data.
- `~/Obsidian/brain` is created from an empty template with working registration, indexing, tasks,
  capture, archive, and verification behavior.
- No current Obsidian content is present in the repository or new empty vault.
- No employer-specific setting, credential, authentication state, session data, or personal machine
  identifier is tracked.
- Dry-run, automated tests, public audit, doctor, and Brew bundle checks pass.
- README and workstation documentation are sufficient to complete required interactive logins after
  installation.
