#!/usr/bin/env bash
set -uo pipefail
DOTFILES_DIR="${DOTFILES_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
source "$DOTFILES_DIR/scripts/lib.sh"
brain_dir="${BRAIN_DIR:-$HOME/Obsidian/brain}"
if [[ -d "$brain_dir" ]]; then info "preserving existing brain: $brain_dir"; exit 0; fi
ensure_dir "$(dirname "$brain_dir")"
run cp -R "$DOTFILES_DIR/brain-template" "$brain_dir"
success "empty living brain prepared at $brain_dir"
