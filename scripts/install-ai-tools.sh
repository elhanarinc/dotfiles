#!/usr/bin/env bash
set -uo pipefail
DOTFILES_DIR="${DOTFILES_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
source "$DOTFILES_DIR/scripts/lib.sh"
if ! command_exists claude; then
  if [[ "${DRY_RUN:-0}" == 1 ]]; then info "would install Claude Code using the official native installer"; else curl -fsSL https://claude.ai/install.sh | bash; fi
fi
if ! command_exists codex; then
  if command_exists brew; then run brew install --cask codex; else warn "Codex requires Homebrew on macOS"; fi
fi
ensure_dir "$HOME/.claude"
copy_template "$DOTFILES_DIR/config/claude/settings.json" "$HOME/.claude/settings.json"
copy_template "$DOTFILES_DIR/config/claude/hooks/tsc-check.mjs" "$HOME/.claude/hooks/tsc-check.mjs"
for agent in dev reviewer runner scout sim-qa; do
  copy_template "$DOTFILES_DIR/config/claude/agents/$agent.md" "$HOME/.claude/agents/$agent.md"
done
# Private, machine/company-specific settings (e.g. autoMode) live outside this public repo.
if command_exists node; then run node "$DOTFILES_DIR/scripts/merge-claude-overlay.mjs"; fi
# Download the plugins the merged settings declare (statusLine depends on claude-hud).
"$DOTFILES_DIR/scripts/install-claude-plugins.sh" || warn "Claude plugin bootstrap reported a problem"
ensure_dir "$HOME/.codex"
copy_template "$DOTFILES_DIR/config/codex/config.toml" "$HOME/.codex/config.toml"
copy_template "$DOTFILES_DIR/config/codex/hooks.json" "$HOME/.codex/hooks.json"
copy_template "$DOTFILES_DIR/config/codex/AGENTS.md" "$HOME/.codex/AGENTS.md"
warn "Existing AI configuration and authentication are preserved; review/merge managed templates manually if files already exist"
