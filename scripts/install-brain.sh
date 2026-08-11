#!/usr/bin/env bash
set -uo pipefail
DOTFILES_DIR="${DOTFILES_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
source "$DOTFILES_DIR/scripts/lib.sh"
brain_dir="${BRAIN_DIR:-$HOME/Obsidian/brain}"

if [[ -d "$brain_dir" ]]; then
  info "preserving existing brain: $brain_dir"
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

info "attach a repository with: node \"$brain_dir/bin/scripts/link-leaf.mjs\" <workspace> <path>"
exit 0
