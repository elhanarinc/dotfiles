#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/test_helper.sh"
export DOTFILES_DIR="$REPO_ROOT" DRY_RUN=0
oc="$HOME/.config/opencode"
# pre-existing service state and an existing config must survive
mkdir -p "$oc"; printf secret > "$oc/service.json"; printf old > "$oc/AGENTS.md"
"$REPO_ROOT/scripts/link-dotfiles.sh" >/dev/null
assert_symlink "$oc/opencode.jsonc"
assert_symlink "$oc/agents/dev.md"
assert_symlink "$oc/plugins/brain/index.js"
[[ ! -L "$oc" ]] || fail "opencode directory must not be a symlink"
[[ ! -L "$oc/package.json" && -f "$oc/package.json" ]] || fail "package.json should be a copy"
[[ "$(cat "$oc/service.json")" == secret ]] || fail "service.json touched"
[[ -f "$HOME/.dotfiles_backup/test/.config/opencode/AGENTS.md" ]] || fail "old AGENTS.md not backed up"
"$REPO_ROOT/scripts/link-dotfiles.sh" >/dev/null
# brain restore: private opencode files land $HOME-relative and are never overwritten
brain="$TEST_ROOT/brain"; priv="$brain/bin/state/opencode-home/config/Desktop/pp"
mkdir -p "$priv"; printf private > "$priv/opencode.jsonc"
BRAIN_DIR="$brain" "$REPO_ROOT/scripts/install-brain.sh" >/dev/null 2>&1 || true
[[ "$(cat "$HOME/Desktop/pp/opencode.jsonc")" == private ]] || fail "private opencode file not restored"
printf edited > "$HOME/Desktop/pp/opencode.jsonc"
BRAIN_DIR="$brain" "$REPO_ROOT/scripts/install-brain.sh" >/dev/null 2>&1 || true
[[ "$(cat "$HOME/Desktop/pp/opencode.jsonc")" == edited ]] || fail "restore overwrote existing file"
# export copies only listed paths
printf 'Desktop/pp/opencode.jsonc\n' > "$brain/bin/state/opencode-home.list"
BRAIN_DIR="$brain" "$REPO_ROOT/scripts/export-opencode-private.sh" >/dev/null
[[ "$(cat "$priv/opencode.jsonc")" == edited ]] || fail "export did not copy listed file"
# public config carries no absolute user paths (company names: scripts/audit-public.sh)
if grep -rE '/Users/' "$REPO_ROOT/config/opencode"; then fail "absolute user path in config/opencode"; fi
# doctor: version major check and drift detection (stubbed binary; PATH without brew keeps it hermetic)
dr() { PATH="$TEST_ROOT/bin:/usr/bin:/bin" DRY_RUN=0 "$REPO_ROOT/scripts/doctor.sh" 2>&1; }
printf '#!/bin/sh\necho "opencode v1.9.0"\n' > "$TEST_ROOT/bin/opencode"; chmod +x "$TEST_ROOT/bin/opencode"
out="$(dr)"
assert_contains "$out" "opencode major is not 2"
assert_contains "$out" "opencode config files linked"
printf '#!/bin/sh\necho "opencode v2.2.0"\n' > "$TEST_ROOT/bin/opencode"
out="$(dr)"; assert_contains "$out" "opencode v2.2.0"
rm "$oc/agents/dev.md"; printf x > "$oc/agents/dev.md"
out="$(dr)"; assert_contains "$out" "opencode: not linked to this repo"
printf 'PASS opencode_test\n'
