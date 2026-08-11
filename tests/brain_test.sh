#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/test_helper.sh"
export DOTFILES_DIR="$REPO_ROOT" DRY_RUN=0 BRAIN_DIR="$HOME/Obsidian/brain"
NODE_BIN="${NODE_BIN:-node}"
command -v "$NODE_BIN" >/dev/null || { printf 'SKIP brain_test (no node)\n'; exit 0; }

S="$BRAIN_DIR/bin/scripts"
project="$HOME/Desktop/pp/repo"
mkdir -p "$project" "$HOME/.claude/projects"

"$REPO_ROOT/scripts/install-brain.sh" >/dev/null
[[ -f "$BRAIN_DIR/bin/state/config.json" ]] || fail "config.json not seeded from example"
[[ -f "$S/lib.mjs" && -f "$S/brief.mjs" && -f "$S/capture.mjs" ]] || fail "scripts missing from installed brain"

# before the workspace map names this root, the session hook must stay completely silent
[[ -z "$(printf '{"cwd":"%s"}' "$project" | "$NODE_BIN" "$S/brief.mjs")" ]] \
  || fail "brief wrote context before the workspace was declared"

printf '{"workspaces":[{"name":"personal","root":"%s"}]}\n' "$HOME/Desktop/pp" \
  > "$BRAIN_DIR/bin/state/config.json"
printf '# personal\n\n- [ ] finish the migration\n- [x] done already\n' \
  > "$BRAIN_DIR/bin/state/tasks/personal.md"

# --- attaching a project moves the harness memory folder into the vault -------
harness="$HOME/.claude/projects/$(printf '%s' "$project" | sed 's/[^A-Za-z0-9]/-/g')/memory"
mkdir -p "$harness"
printf -- '---\nname: seed\nindex_title: Seed note\nindex_hook: "carried over"\nmetadata:\n  type: project\n---\n\nbody\n' \
  > "$harness/seed.md"
"$NODE_BIN" "$S/link-leaf.mjs" personal "$project" >/dev/null
assert_symlink "$harness"
[[ -f "$BRAIN_DIR/personal/repo/seed.md" ]] || fail "existing note was not moved into the vault"

# --- the index is generated from frontmatter, never by hand ------------------
assert_contains "$(cat "$BRAIN_DIR/personal/repo/MEMORY.md")" "[Seed note](seed.md) — carried over"

# a note written after linking is indexed by the PostToolUse hook, with no manual reindex
printf -- '---\nname: later\nindex_title: Later note\nindex_hook: "added by hook"\nmetadata:\n  type: reference\n---\n\nbody\n' \
  > "$BRAIN_DIR/personal/repo/later.md"
printf '{"tool_input":{"file_path":"%s"}}' "$BRAIN_DIR/personal/repo/later.md" \
  | "$NODE_BIN" "$S/reindex-hook.mjs" >/dev/null
assert_contains "$(cat "$BRAIN_DIR/personal/repo/MEMORY.md")" "[Later note](later.md) — added by hook"

# --- session start: in scope prints the workspace's open tasks ---------------
out="$(printf '{"cwd":"%s"}' "$project" | "$NODE_BIN" "$S/brief.mjs")"
assert_contains "$out" "finish the migration"
[[ "$out" != *"done already"* ]] || fail "brief printed a completed task"

# --- session start: out of scope prints nothing ------------------------------
[[ -z "$(printf '{"cwd":"%s"}' "$HOME/elsewhere" | "$NODE_BIN" "$S/brief.mjs")" ]] \
  || fail "brief wrote context for an unknown cwd"

# --- session end: captures in scope, silent out of scope ---------------------
transcript="$HOME/transcript.jsonl"
printf '%s\n' \
  '{"type":"user","message":{"content":"first prompt"}}' \
  '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Bash","input":{"command":"aws route53 list-hosted-zones"}}]}}' \
  '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Bash","input":{"command":"aws route53 change-resource-record-sets --hosted-zone-id ZTEST"}}]}}' \
  '{"type":"user","message":{"content":"second prompt"}}' > "$transcript"
printf '{"cwd":"%s","session_id":"abcd1234","transcript_path":"%s","reason":"clear"}' "$project" "$transcript" \
  | "$NODE_BIN" "$S/capture.mjs"
capture="$BRAIN_DIR/bin/state/inbox/personal/$(date -u +%Y-%m-%d)-abcd1234.md"
[[ -f "$capture" ]] || fail "session capture missing: $capture"
assert_contains "$(cat "$capture")" "first prompt"

# a session that touches no file is still recorded: state-changing commands land in `ops`,
# read-only ones do not
assert_contains "$(cat "$capture")" 'ops: "aws route53 change-resource-record-sets --hosted-zone-id ZTEST"'
[[ "$(cat "$capture")" != *"list-hosted-zones"* ]] || fail "a read-only command was captured as ops"

printf '{"cwd":"%s","session_id":"zzzz9999","transcript_path":"%s","reason":"clear"}' "$HOME/elsewhere" "$transcript" \
  | "$NODE_BIN" "$S/capture.mjs"
assert_not_exists "$BRAIN_DIR/bin/state/inbox/personal/$(date -u +%Y-%m-%d)-zzzz9999.md"

# --- an existing brain is never overwritten ----------------------------------
"$REPO_ROOT/scripts/install-brain.sh" >/dev/null
[[ -f "$BRAIN_DIR/personal/repo/seed.md" ]] || fail "re-running install-brain destroyed existing notes"

printf 'PASS brain_test\n'
