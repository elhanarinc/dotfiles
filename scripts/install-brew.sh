#!/usr/bin/env bash
set -uo pipefail
DOTFILES_DIR="${DOTFILES_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
source "$DOTFILES_DIR/scripts/lib.sh"
detect_os
phase="${1:-brew}"

# Homebrew and most formulae need the Xcode Command Line Tools. Wait for the
# GUI installer in the foreground, bounded, before the brew phase does anything.
ensure_xcode_clt() {
  xcode-select -p >/dev/null 2>&1 && return 0
  if [[ "${DRY_RUN:-0}" == 1 ]]; then info "would run xcode-select --install and wait for the Command Line Tools"; return 0; fi
  info "installing Xcode Command Line Tools (complete the macOS dialog)"
  xcode-select --install >/dev/null 2>&1 || true
  local waited=0 interval="${XCODE_CLT_POLL_SECONDS:-10}" limit="${XCODE_CLT_TIMEOUT_SECONDS:-1800}"
  while ! xcode-select -p >/dev/null 2>&1; do
    (( waited >= limit )) && die "Xcode Command Line Tools were not installed after $((limit / 60)) min; run xcode-select --install, then re-run ./install.sh"
    sleep "$interval"; waited=$((waited + interval))
  done
  success "Xcode Command Line Tools installed"
}
ensure_xcode_clt
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
# Under --dry-run brew must not execute at all (it writes its cache under $HOME),
# so the `brew trust --help` capability probe is skipped there.
if [[ -n "$taps" ]] && { [[ "${DRY_RUN:-0}" == 1 ]] || brew trust --help >/dev/null 2>&1; }; then
  for t in $taps; do run brew trust --tap "$t"; done
elif [[ -n "$taps" ]]; then
  warn "this Homebrew has no \`brew trust\`; tap(s) may fail to load: $taps"
fi
if [[ "$phase" == brew ]]; then
  run env HOMEBREW_BUNDLE_CASK_SKIP="$casks" brew bundle install --file="$DOTFILES_DIR/Brewfile" --no-upgrade
else
  run env HOMEBREW_BUNDLE_BREW_SKIP="$formulae" brew bundle install --file="$DOTFILES_DIR/Brewfile" --no-upgrade
fi
