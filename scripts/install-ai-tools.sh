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
# OpenCode 2 (the v1 installer at opencode.ai/install refuses 2.x). Pinned; override with OPENCODE_VERSION.
if [[ ! -x "$HOME/.opencode/bin/opencode" ]] && ! command_exists opencode; then
  if [[ "${DRY_RUN:-0}" == 1 ]]; then info "would install OpenCode ${OPENCODE_VERSION:-2.2.0} using the official v2 installer"
  else curl -fsSL https://opencode.ai/v2/install | bash -s -- --version "${OPENCODE_VERSION:-2.2.0}" || warn "OpenCode install failed"; fi
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
# Orchestrator roles (Codex reads ~/.codex/agents/*.toml; mirrors the Claude agents).
for agent in dev reviewer runner scout; do
  copy_template "$DOTFILES_DIR/config/codex/agents/$agent.toml" "$HOME/.codex/agents/$agent.toml"
done
# brain-recall lives in the private brain/Claude setup, so link it by $HOME path instead of vendoring it.
if [[ -f "$HOME/.claude/skills/brain-recall/SKILL.md" ]]; then
  ensure_dir "$HOME/.codex/skills"
  [[ -e "$HOME/.codex/skills/brain-recall" || -L "$HOME/.codex/skills/brain-recall" ]] || run ln -s "$HOME/.claude/skills/brain-recall" "$HOME/.codex/skills/brain-recall"
fi
warn "Existing AI configuration and authentication are preserved; review/merge managed templates manually if files already exist"
# Antigravity (agy): merge the brain hooks into ~/.gemini/config/hooks.json by entry name.
# Existing entries (e.g. agy-live-hud) are kept as-is; only missing brain-* entries are added.
if command_exists node; then
  ensure_dir "$HOME/.gemini/config"
  run node -e '
    const fs = require("fs");
    const [src, dst] = process.argv.slice(1);
    const add = JSON.parse(fs.readFileSync(src, "utf8"));
    let cur = {};
    try { cur = JSON.parse(fs.readFileSync(dst, "utf8")); } catch {}
    let changed = false;
    for (const [k, v] of Object.entries(add)) if (!(k in cur)) { cur[k] = v; changed = true; }
    if (changed || !fs.existsSync(dst)) fs.writeFileSync(dst, JSON.stringify(cur, null, 2) + "\n");
  ' "$DOTFILES_DIR/config/gemini/hooks.json" "$HOME/.gemini/config/hooks.json"
fi
