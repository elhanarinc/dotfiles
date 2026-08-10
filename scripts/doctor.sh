#!/usr/bin/env bash
set -uo pipefail
source "${DOTFILES_DIR:?}/scripts/lib.sh"
detect_os
info "platform: $OS/$ARCH"
missing=0
for cmd in git zsh rg jq tmux vim starship code docker claude codex; do
  if command_exists "$cmd"; then success "$cmd"; else warn "missing: $cmd"; missing=$((missing + 1)); fi
done
brain_dir="${BRAIN_DIR:-$HOME/Obsidian/brain}"
[[ -d "$brain_dir/bin" ]] && success "living brain: $brain_dir" || warn "living brain not installed"
[[ $missing -eq 0 ]] || warn "$missing optional/recommended commands are unavailable"
exit 0
