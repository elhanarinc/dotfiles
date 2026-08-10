#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/test_helper.sh"
export DOTFILES_DIR="$REPO_ROOT" DRY_RUN=1
brew_out="$("$REPO_ROOT/scripts/install-brew.sh" brew)"
apps_out="$("$REPO_ROOT/scripts/install-brew.sh" apps)"
assert_contains "$brew_out" "HOMEBREW_BUNDLE_CASK_SKIP="
assert_contains "$brew_out" "docker"
assert_contains "$apps_out" "HOMEBREW_BUNDLE_BREW_SKIP="
assert_contains "$apps_out" "coreutils"
printf 'PASS brew_test\n'
