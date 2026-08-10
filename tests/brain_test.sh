#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/test_helper.sh"
export DOTFILES_DIR="$REPO_ROOT" DRY_RUN=0 BRAIN_DIR="$HOME/Obsidian/brain"
mkdir -p "$HOME/project"
"$REPO_ROOT/scripts/install-brain.sh"
node "$BRAIN_DIR/bin/register-project.mjs" "$HOME/project"
node "$BRAIN_DIR/bin/capture.mjs" --cwd "$HOME/project" --source test --text "portable decision"
out="$(node "$BRAIN_DIR/bin/brief.mjs" --cwd "$HOME/project")"
assert_contains "$out" "portable decision"
node "$BRAIN_DIR/bin/reindex.mjs" --quiet
[[ -f "$BRAIN_DIR/index.md" ]] || fail "index missing"
printf 'PASS brain_test\n'
