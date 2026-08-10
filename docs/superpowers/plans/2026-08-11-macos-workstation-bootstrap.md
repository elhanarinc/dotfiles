# macOS Workstation Bootstrap Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn the public dotfiles repository into an idempotent, public-safe Apple Silicon Mac bootstrap that installs the general workstation, configures Claude/Codex, and creates an empty Obsidian living brain without copying identity, credentials, company data, or history.

**Architecture:** Keep `install.sh` as a small phase orchestrator and put mutation logic in focused scripts sharing `scripts/lib.sh`. All filesystem changes use an explicit allowlist, backup-before-replace behavior, and a single dry-run-aware command layer. Tests run only in temporary homes with stub executables; the current Mac is validated only with dry-run and read-only commands.

**Tech Stack:** Bash 3.2-compatible shell scripts, Homebrew Bundle, JSON/TOML/Markdown configuration, Node.js for portable brain indexing/registration scripts, Git.

---

## Non-negotiable execution boundary

- Never run `./install.sh` without `--dry-run` on the current Mac.
- Never invoke a mutating phase script against the real `HOME`.
- Mutation and idempotency tests must set `HOME` to a `mktemp -d` fixture and put stub commands first in `PATH`.
- Real-machine checks are limited to `./install.sh --dry-run`, `scripts/audit-public.sh`, `scripts/inventory.sh`, `scripts/doctor.sh`, `brew bundle check`, syntax checks, and Git inspection.
- Do not push automatically. Before any push, delete `docs/`, synchronize `README.md`, `AGENTS.md`, `CLAUDE.md`, and `.gitignore`, then present the final diff and commit summary to the user.

### Task 1: Build the safe orchestration and test foundation

**Files:**
- Modify: `install.sh`
- Create: `scripts/lib.sh`
- Create: `tests/test_helper.sh`
- Create: `tests/install_test.sh`
- Create: `tests/run.sh`

**Steps:**

1. Write failing tests for `--help`, unknown phases, `--only`, `--skip`, dry-run output, and zero writes under dry-run.
2. Add Bash assertions, a temporary `HOME`, command stubs, and automatic cleanup in `tests/test_helper.sh`.
3. Implement `scripts/lib.sh` with `info`, `success`, `warn`, `error`, `command_exists`, `run`, `ensure_dir`, `backup_path`, `link_file`, `copy_template`, and OS detection. Every mutating helper must honor `DRY_RUN=1`.
4. Refactor `install.sh` into a phase dispatcher for `brew`, `apps`, `shell`, `links`, `vscode`, `ai`, `brain`, and `doctor`. Validate phase names before any mutation and collect phase failures for the final exit code.
5. Run `bash tests/install_test.sh` and `bash -n install.sh scripts/lib.sh`.
6. Commit: `refactor(bootstrap): add safe phase orchestration`.

### Task 2: Make public safety and local identity deterministic

**Files:**
- Create: `scripts/audit-public.sh`
- Create: `scripts/inventory.sh`
- Modify: `.gitconfig`
- Create: `.gitconfig.local.example`
- Modify: `.zshrc.local.example`
- Modify: `.gitignore`
- Create: `tests/audit_public_test.sh`

**Steps:**

1. Write failing fixture tests proving the audit rejects credential-like assignments, private keys, `/Users/<name>` paths, personal Git identity, and employer names, while allowing documented placeholders such as `${OPENAI_API_KEY}`.
2. Implement an audit over `git ls-files` with explicit exclusions for test fixtures that intentionally contain sentinel secrets. Print file and rule, never matched secret values.
3. Implement a read-only inventory comparing tracked symlink targets, Brewfile satisfaction, application presence, CLI presence, VS Code extension drift, and AI configuration presence.
4. Move `user.name` and `user.email` out of `.gitconfig`; add a conditional include for `~/.gitconfig.local` and a placeholder example.
5. Generalize `.zshrc.local.example`; remove company names, account IDs, real paths, and credential values.
6. Expand `.gitignore` for local Git identity, Claude/Codex auth/state, brain runtime data, backups, logs, and generated reports.
7. Run audit tests and the real read-only audit.
8. Commit: `feat(security): enforce public-safe configuration`.

### Task 3: Reconcile Homebrew packages and desktop applications

**Files:**
- Modify: `Brewfile`
- Create: `scripts/install-brew.sh`
- Create: `tests/brew_test.sh`

**Steps:**

1. Verify current Homebrew formula/cask tokens with read-only `brew info`/`brew search` checks.
2. Add intentional general CLI/media/document tools and required apps: Docker Desktop, VS Code, Ghostty, Chrome, Spotify, Slack, Obsidian, Postman, Lens, Caffeine, ChatGPT, Claude, fonts, and approved general utilities.
3. Keep company-specific software out and never add `brew bundle cleanup`.
4. Implement Homebrew installation plus `brew bundle install --no-upgrade`; dry-run prints exact commands only.
5. Test with a stub `brew` that records calls and prove cleanup is never invoked.
6. Run `brew bundle check --file=Brewfile` read-only; missing packages are an expected inventory result, not authorization to install them.
7. Commit: `feat(brew): define complete macos workstation`.

### Task 4: Modularize shell, links, development tools, and VS Code

**Files:**
- Create: `scripts/install-shell.sh`
- Create: `scripts/install-dev-tools.sh`
- Create: `scripts/link-dotfiles.sh`
- Modify: `.config/Code/User/settings.json`
- Modify: `.config/Code/extensions.txt`
- Create: `tests/links_test.sh`
- Create: `tests/vscode_test.sh`

**Steps:**

1. Write fixture tests for exact-symlink no-op, differing-file backup, missing-parent creation, dry-run no-write, and repeat-run idempotency.
2. Move Oh My Zsh, plugins, NVM, Starship, TPM, fzf, formatters, and VS Code extension logic out of the old monolith.
3. Define the complete link allowlist explicitly; never walk and link arbitrary repository files.
4. Merge only stable VS Code drift, including `git.ignoreRebaseWarning`; exclude timestamps, surveys, counters, history, tokens, and machine paths.
5. Ensure extension installation is idempotent and individual failures are summarized.
6. Run fixture tests twice against the same temporary `HOME` and run syntax checks.
7. Commit: `refactor(config): modularize workstation setup`.

### Task 5: Add portable Claude and Codex setup

**Files:**
- Create: `config/claude/settings.json`
- Create: `config/codex/config.toml`
- Create: `config/codex/hooks.json`
- Create: `config/codex/AGENTS.md`
- Create: `scripts/install-ai-tools.sh`
- Create: `tests/ai_tools_test.sh`

**Steps:**

1. Inspect current live configs by allowlist and verify current official install methods without copying auth, history, caches, trust state, device state, project paths, or plugin snapshots.
2. Write tests where pre-existing user settings survive and only managed portable keys/hooks are merged or linked after backup.
3. Install Claude Code and Codex only when absent; dry-run prints the official command/cask action.
4. Add generic living-brain hooks using `$HOME`-relative paths. Do not fabricate Codex trust hashes; document the one-time interactive trust step.
5. Keep all secrets as environment-variable references and all project registration generic.
6. Run fixture tests and scan AI config for absolute user paths or token-shaped values.
7. Commit: `feat(ai): add portable claude and codex setup`.

### Task 6: Package a data-free Obsidian living brain

**Files:**
- Create: `brain-template/README.md`
- Create: `brain-template/config.json`
- Create: `brain-template/bin/brief.mjs`
- Create: `brain-template/bin/capture.mjs`
- Create: `brain-template/bin/reindex.mjs`
- Create: `brain-template/bin/register-project.mjs`
- Create: `brain-template/tasks/general.md`
- Create: `brain-template/inbox/.gitkeep`
- Create: `brain-template/archive/.gitkeep`
- Create: `brain-template/workspaces/.gitkeep`
- Create: `scripts/install-brain.sh`
- Create: `tests/brain_test.sh`

**Steps:**

1. Derive only reusable behavior from the existing brain scripts; do not copy notes, tasks, indexes, workspaces, project names, timestamps, or archive/history.
2. Write tests for creating an empty brain, registering a generic fixture repository, indexing Markdown links, capture/brief behavior, repeat-run preservation, and dry-run no-write.
3. Make runtime directories and generated indexes ignored in the installed brain while keeping `.gitkeep` placeholders in this repository.
4. Connect Claude/Codex hooks to the generic scripts and make missing-brain behavior non-fatal with a clear warning.
5. Run fixture tests and grep the template for current personal/company/project identifiers.
6. Commit: `feat(brain): add empty living-memory template`.

### Task 7: Add doctor output and complete operator documentation

**Files:**
- Create: `scripts/doctor.sh`
- Create: `docs/workstation.md` (temporary source material; removed in final cleanup)
- Modify: `README.md`
- Create: `AGENTS.md`
- Modify: `CLAUDE.md`

**Steps:**

1. Implement a read-only doctor that checks OS/architecture, tools, apps, expected links, VS Code CLI/extensions, Claude/Codex availability, brain structure, and pending manual logins/trust steps.
2. Document phases, dry-run, selective runs, backups, supported platforms, installed inventory, local-only config, AI login/trust, empty-brain registration, troubleshooting, and uninstall/recovery boundaries.
3. Make `AGENTS.md` and `CLAUDE.md` agree on public safety, Conventional Commits, testing, no real-machine installer runs during repository development, and living-brain behavior.
4. Add doctor fixture tests and run it read-only on the real Mac.
5. Commit: `docs(bootstrap): document workstation lifecycle`.

### Task 8: Final verification, documentation cleanup, and handoff

**Files:**
- Delete: `docs/`
- Review/modify: `README.md`
- Review/modify: `AGENTS.md`
- Review/modify: `CLAUDE.md`
- Review/modify: `.gitignore`

**Steps:**

1. Run all tests: `bash tests/run.sh`.
2. Run syntax checks over every shell script and JSON parsing over every tracked JSON file.
3. Run two full installer passes only in the same temporary fake `HOME` with command stubs; compare resulting trees and logs for idempotency.
4. Run on the real machine only: `./install.sh --dry-run`, `scripts/audit-public.sh`, `scripts/inventory.sh`, `scripts/doctor.sh`, and `brew bundle check --file=Brewfile`.
5. Delete the entire `docs/` directory as requested.
6. Reconcile `README.md`, `AGENTS.md`, `CLAUDE.md`, and `.gitignore` against the final file tree and behavior; remove stale paths and promises.
7. Run the public audit again after deleting docs, then inspect `git diff --check`, `git status`, tracked file list, commit history, and repository-vs-origin diff.
8. Commit final cleanup: `chore(repo): finalize public bootstrap`.
9. Present the user with verification evidence, commits, and the exact push target. Do not push until the user approves the final handoff.
