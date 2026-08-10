#!/usr/bin/env bash
set -uo pipefail
DOTFILES_DIR="${DOTFILES_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
source "$DOTFILES_DIR/scripts/lib.sh"
detect_os
phase="${1:-brew}"
[[ "$OS" == macos ]] || { info "Homebrew desktop phase skipped on Linux"; exit 0; }
if ! command_exists brew; then
  if [[ "${DRY_RUN:-0}" == 1 ]]; then info "would install Homebrew from brew.sh"; exit 0; fi
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  eval "$("$HOMEBREW_PREFIX/bin/brew" shellenv)"
fi
formulae="$(sed -nE 's/^[[:space:]]*brew[[:space:]]+"([^"]+)".*/\1/p' "$DOTFILES_DIR/Brewfile" | tr '\n' ' ')"
casks="$(sed -nE 's/^[[:space:]]*cask[[:space:]]+"([^"]+)".*/\1/p' "$DOTFILES_DIR/Brewfile" | tr '\n' ' ')"
if [[ "$phase" == brew ]]; then
  run env HOMEBREW_BUNDLE_CASK_SKIP="$casks" brew bundle install --file="$DOTFILES_DIR/Brewfile" --no-upgrade
else
  run env HOMEBREW_BUNDLE_BREW_SKIP="$formulae" brew bundle install --file="$DOTFILES_DIR/Brewfile" --no-upgrade
fi
