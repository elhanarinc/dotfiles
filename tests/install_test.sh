#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/test_helper.sh"
out="$("$REPO_ROOT/install.sh" --help)"; assert_contains "$out" "--dry-run"
if "$REPO_ROOT/install.sh" --only nope >/dev/null 2>&1; then fail "unknown phase accepted"; fi
out="$("$REPO_ROOT/install.sh" --dry-run --only links)"; assert_contains "$out" "DRY RUN"
assert_not_exists "$HOME/.zshrc"
printf 'PASS install_test\n'
