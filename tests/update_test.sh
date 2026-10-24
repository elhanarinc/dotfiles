#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/test_helper.sh"
export TEST_COMMAND_LOG="$TEST_ROOT/commands.log"; : > "$TEST_COMMAND_LOG"
export DOTFILES_DIR="$REPO_ROOT"
# Tools missing: every step warns and the script still succeeds.
out="$(PATH="/usr/bin:/bin" ZSH="$TEST_ROOT/none" "$REPO_ROOT/scripts/update.sh" 2>&1)"
assert_contains "$out" "brew missing"
assert_contains "$out" "claude missing"
# Present: dry run lists nice-wrapped commands and never cleans up.
for t in brew code claude; do stub "$t"; done
out="$(DRY_RUN=1 "$REPO_ROOT/scripts/update.sh" 2>&1)"
assert_contains "$out" "nice -n 15 brew upgrade"
assert_contains "$out" "brew bundle --file="
assert_contains "$out" "code --update-extensions"
assert_contains "$out" "claude plugin marketplace update"
[[ "$out" != *cleanup* ]] || fail "update must never cleanup"
printf 'PASS update_test\n'
