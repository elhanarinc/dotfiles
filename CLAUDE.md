# dotfiles agent instructions

Follow [AGENTS.md](AGENTS.md) for scope, safety, validation, and commit rules.

Use Conventional Commits and keep descriptions lowercase with no trailing period. This is a public repository: never copy Claude authentication, history, project memory, plugin caches, marketplace state, permissions tied to local paths, or employer-specific configuration.

While changing the installer on an existing configured Mac, run only `./install.sh --dry-run`. Exercise mutations in a temporary `HOME`; preserve current configuration and existing Obsidian content.

Generic subagents live in `config/claude/agents/`. Anything private or company-specific (autoMode rules, private skills, workspace CLAUDE.md files) belongs in the private brain (`claude-settings.overlay.json`, `bin/state/claude-home/`), never here.

Claude's portable settings live in `config/claude/settings.json`. The installed living brain is local data and must not be imported into the repository.

OpenCode: generic config lives in `config/opencode/` (linked per file by `link-dotfiles.sh`; `package.json` is copied). Private files (personal permissions) go in the brain's `bin/state/opencode-home/config/`, exported with `just opencode-private-export`. Never link `~/.config/opencode` as a directory; never read `service.json`/`auth.json`.
