#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/test_helper.sh"
export TEST_COMMAND_LOG="$TEST_ROOT/commands.log"; : > "$TEST_COMMAND_LOG"
export DOTFILES_DIR="$REPO_ROOT"

# --- plugin bootstrap ---------------------------------------------------------
mkdir -p "$HOME/.claude"
cp "$REPO_ROOT/config/claude/settings.json" "$HOME/.claude/settings.json"
# Stub claude: nothing registered, only one plugin installed; every call is logged.
cat > "$TEST_ROOT/bin/claude" <<'STUB'
#!/bin/sh
printf '%s\n' "claude $*" >> "$TEST_COMMAND_LOG"
case "$1 $2 $3" in
  "plugin marketplace list") echo '[]' ;;
  "plugin list --json") echo '[{"id":"claude-hud@claude-hud"}]' ;;
esac
exit 0
STUB
chmod +x "$TEST_ROOT/bin/claude"
out="$("$REPO_ROOT/scripts/install-claude-plugins.sh" 2>&1)"
log="$(cat "$TEST_COMMAND_LOG")"
assert_contains "$log" "claude plugin marketplace add jarrodwatts/claude-hud"
assert_contains "$log" "claude plugin marketplace add anthropics/claude-plugins-official"
assert_contains "$log" "claude plugin install superpowers@claude-plugins-official --scope user"
assert_contains "$out" "plugin present: claude-hud@claude-hud"
[[ "$log" != *"install claude-hud@claude-hud"* ]] || fail "reinstalled a present plugin"

# Failures warn, never abort.
cat > "$TEST_ROOT/bin/claude" <<'STUB'
#!/bin/sh
[ "$2" = install ] && exit 1
echo '[]'
STUB
fail_out="$("$REPO_ROOT/scripts/install-claude-plugins.sh" 2>&1)"
assert_contains "$fail_out" "could not install plugin"

# Dry run: no mutating calls.
: > "$TEST_COMMAND_LOG"; stub claude
DRY_RUN=1 "$REPO_ROOT/scripts/install-claude-plugins.sh" >/dev/null 2>&1
[[ ! -s "$TEST_COMMAND_LOG" ]] || fail "dry run called claude"

# --- Xcode Command Line Tools ---------------------------------------------------
# Simulated: xcode-select -p fails until --install has been called twice polling.
cat > "$TEST_ROOT/bin/xcode-select" <<'STUB'
#!/bin/sh
printf '%s\n' "xcode-select $*" >> "$TEST_COMMAND_LOG"
case "$1" in
  -p) [ -f "$XCODE_FLAG" ] ;;
  --install) touch "$XCODE_FLAG" ;;
esac
STUB
chmod +x "$TEST_ROOT/bin/xcode-select"
export XCODE_FLAG="$TEST_ROOT/xcode-installed" XCODE_CLT_POLL_SECONDS=0
: > "$TEST_COMMAND_LOG"
dry="$(DRY_RUN=1 "$REPO_ROOT/scripts/install-brew.sh" 2>&1)"
assert_contains "$dry" "would run xcode-select --install"
assert_not_exists "$XCODE_FLAG"
# Real run waits then proceeds; brew is absent so the script stops after the CLT step.
PATH="$TEST_ROOT/bin:/usr/bin:/bin" "$REPO_ROOT/scripts/install-brew.sh" >/dev/null 2>&1 || true
assert_contains "$(cat "$TEST_COMMAND_LOG")" "xcode-select --install"
# Timeout dies with a clear message.
rm "$XCODE_FLAG"
cat > "$TEST_ROOT/bin/xcode-select" <<'STUB'
#!/bin/sh
[ "$1" = -p ] && exit 1
exit 0
STUB
to="$(XCODE_CLT_TIMEOUT_SECONDS=0 "$REPO_ROOT/scripts/install-brew.sh" 2>&1 || true)"
assert_contains "$to" "Command Line Tools were not installed"
rm "$TEST_ROOT/bin/xcode-select"

# --- claude-doctor ----------------------------------------------------------------
mkdir -p "$HOME/Obsidian/brain/bin/state" "$HOME/.claude/plugins/cache/claude-hud/claude-hud"
echo '{"permissions":{"ask":["Bash(overlay-ask)"]}}' > "$HOME/Obsidian/brain/bin/state/claude-settings.overlay.json"
node -e '
const fs=require("fs");const s=JSON.parse(fs.readFileSync(process.argv[1]));
s.permissions.ask.push("Bash(overlay-ask)");
s.permissions.allow=["Bash(local-only *)"];
s.localKey=1;
s.hooks={Stop:[{hooks:[{type:"command",command:"node \"$HOME/gone/missing.mjs\""}]}]};
fs.writeFileSync(process.argv[2],JSON.stringify(s));' "$REPO_ROOT/config/claude/settings.json" "$HOME/.claude/settings.json"
before="$(cksum < "$HOME/.claude/settings.json")"
doc="$(node "$REPO_ROOT/scripts/claude-doctor.mjs" 2>&1)"
assert_contains "$doc" "only in live: localKey"
assert_contains "$doc" "Bash(local-only *)"
assert_contains "$doc" "hook path missing"
assert_contains "$doc" "plugin enabled but not installed: superpowers@claude-plugins-official"
[[ "$doc" != *"overlay-ask"* ]] || fail "overlay entry reported as local"
[[ "$before" == "$(cksum < "$HOME/.claude/settings.json")" ]] || fail "claude-doctor modified settings"
printf 'PASS claude_plugins_test\n'
