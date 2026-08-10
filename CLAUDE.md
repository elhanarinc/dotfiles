# dotfiles agent instructions

Follow [AGENTS.md](AGENTS.md) for scope, safety, validation, and commit rules.

Use Conventional Commits and keep descriptions lowercase with no trailing period. This is a public repository: never copy Claude authentication, history, project memory, plugin caches, marketplace state, permissions tied to local paths, or employer-specific configuration.

While changing the installer on an existing configured Mac, run only `./install.sh --dry-run`. Exercise mutations in a temporary `HOME`; preserve current configuration and existing Obsidian content.

Claude's portable settings live in `config/claude/settings.json`. The installed living brain is local data and must not be imported into the repository.
