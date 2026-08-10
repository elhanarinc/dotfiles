#!/usr/bin/env bash
set -uo pipefail
source "${DOTFILES_DIR:?}/scripts/lib.sh"
detect_os
phase="${1:-brew}"
[[ "$OS" == macos ]] || { info "Homebrew desktop phase skipped on Linux"; exit 0; }
if ! command_exists brew; then
  [[ "$phase" == apps ]] && { warn "brew unavailable; apps handled by Brewfile after Homebrew install"; exit 0; }
  if [[ "${DRY_RUN:-0}" == 1 ]]; then info "would install Homebrew from brew.sh"; exit 0; fi
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  eval "$("$HOMEBREW_PREFIX/bin/brew" shellenv)"
fi
[[ "$phase" == apps ]] && { info "GUI applications are managed by the Brewfile phase"; exit 0; }
run brew bundle install --file="$DOTFILES_DIR/Brewfile" --no-upgrade
