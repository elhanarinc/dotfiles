#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/test_helper.sh"
export DOTFILES_DIR="$REPO_ROOT" DRY_RUN=0
mkdir -p "$HOME"; printf old > "$HOME/.zshrc"
"$REPO_ROOT/scripts/link-dotfiles.sh"
assert_symlink "$HOME/.zshrc"
[[ -f "$HOME/.dotfiles_backup/test/.zshrc" ]] || fail "old zshrc not backed up"
"$REPO_ROOT/scripts/link-dotfiles.sh"
printf 'PASS links_test\n'
