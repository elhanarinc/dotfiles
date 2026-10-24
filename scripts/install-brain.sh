#!/usr/bin/env bash
set -uo pipefail
DOTFILES_DIR="${DOTFILES_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
source "$DOTFILES_DIR/scripts/lib.sh"
brain_dir="${BRAIN_DIR:-$HOME/Obsidian/brain}"

if [[ -d "$brain_dir" ]]; then
  info "preserving existing brain: $brain_dir"
elif [[ -n "${BRAIN_REPO:-}" ]]; then
  ensure_dir "$(dirname "$brain_dir")"
  if run git clone "$BRAIN_REPO" "$brain_dir"; then
    success "private brain cloned to $brain_dir"
  else
    warn "could not clone BRAIN_REPO: $BRAIN_REPO"
  fi
else
  ensure_dir "$(dirname "$brain_dir")"
  run cp -R "$DOTFILES_DIR/brain-template" "$brain_dir"
  success "empty living brain prepared at $brain_dir"
fi

# Machine-local workspace map. Created once and never overwritten, like ~/.zshrc.local.
# Until it lists a root that matches your cwd, every brain hook stays silent by design.
config="$brain_dir/bin/state/config.json"
example="$brain_dir/bin/state/config.example.json"
if [[ ! -f "$config" && -f "$example" ]]; then
  run cp "$example" "$config"
  warn "edit $config with this machine's workspace names and roots"
fi

# Private Claude files (skills, workspace CLAUDE.md, ...) kept in the private brain.
# Restored to the same $HOME-relative path; existing files are never overwritten.
claude_home="$brain_dir/bin/state/claude-home"
if [[ -d "$claude_home" ]]; then
  while IFS= read -r -d '' f; do
    copy_template "$f" "$HOME/${f#"$claude_home"/}"
  done < <(find "$claude_home" -type f -print0)
fi

# Merge the private settings overlay now that the brain exists (the ai phase runs earlier).
if command_exists node; then
  run node "$DOTFILES_DIR/scripts/merge-claude-overlay.mjs" "$brain_dir/bin/state/claude-settings.overlay.json"
fi

info "attach a repository with: node \"$brain_dir/bin/scripts/link-leaf.mjs\" <workspace> <path>"
exit 0
