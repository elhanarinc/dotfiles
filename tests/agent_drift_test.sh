#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/test_helper.sh"
# claude-doctor.mjs warns when a live role agent differs from its dotfiles source.
assert_not_contains() { [[ "$1" != *"$2"* ]] || fail "expected output NOT to contain: $2"; }
home="$TEST_ROOT/home"; mkdir -p "$home/.claude/agents" "$home/.codex/agents"
run_doctor() { HOME="$home" node "$REPO_ROOT/scripts/claude-doctor.mjs" 2>&1; }

# missing live files: no crash, no agent warning
out="$(run_doctor)"
assert_not_contains "$out" "agent drift"

# identical copies: no warning
cp "$REPO_ROOT"/config/claude/agents/*.md "$home/.claude/agents/"
cp "$REPO_ROOT"/config/codex/agents/*.toml "$home/.codex/agents/"
out="$(run_doctor)"
assert_not_contains "$out" "agent drift"

# differing copies: warning names the file and the cp fix
printf '\nlocal edit\n' >> "$home/.claude/agents/sim-qa.md"
printf '\nlocal edit\n' >> "$home/.codex/agents/dev.toml"
out="$(run_doctor)"
assert_contains "$out" "[WARN] agent drift: ~/.claude/agents/sim-qa.md"
assert_contains "$out" "[WARN] agent drift: ~/.codex/agents/dev.toml"
assert_contains "$out" "cp \"$REPO_ROOT/config/claude/agents/sim-qa.md\" \"$home/.claude/agents/sim-qa.md\""
assert_not_contains "$out" "agent drift: ~/.claude/agents/dev.md"
printf 'PASS agent_drift_test\n'
