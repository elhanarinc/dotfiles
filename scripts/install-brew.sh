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
taps="$(sed -nE 's/^[[:space:]]*tap[[:space:]]+"([^"]+)".*/\1/p' "$DOTFILES_DIR/Brewfile")"
# `brew bundle` cannot express tap trust: a `tap` line taps the repo, but loading a
# formula from it still fails with "Refusing to load formula from untrusted tap".
# Trust every tap the Brewfile declares before either bundle phase runs — both the
# `brew` and the `apps` phase read the same file, so this sits above the branch.
if [[ -n "$taps" ]] && brew trust --help >/dev/null 2>&1; then
  for t in $taps; do run brew trust --tap "$t"; done
elif [[ -n "$taps" ]]; then
  warn "this Homebrew has no \`brew trust\`; tap(s) may fail to load: $taps"
fi
if [[ "$phase" == brew ]]; then
  run env HOMEBREW_BUNDLE_CASK_SKIP="$casks" brew bundle install --file="$DOTFILES_DIR/Brewfile" --no-upgrade
else
  run env HOMEBREW_BUNDLE_BREW_SKIP="$formulae" brew bundle install --file="$DOTFILES_DIR/Brewfile" --no-upgrade
fi
