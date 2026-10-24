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

# --- private Claude files restore: same relative path, never overwrite ------
priv="$BRAIN_DIR/bin/state/claude-home"
mkdir -p "$priv/.claude/skills/x" "$priv/Desktop/work"
printf 'private skill\n' > "$priv/.claude/skills/x/SKILL.md"
printf 'private rules\n' > "$priv/Desktop/work/CLAUDE.md"
mkdir -p "$HOME/Desktop/work"; printf 'local rules\n' > "$HOME/Desktop/work/CLAUDE.md"
"$REPO_ROOT/scripts/install-brain.sh" >/dev/null
[[ "$(cat "$HOME/.claude/skills/x/SKILL.md")" == "private skill" ]] || fail "claude-home file not restored"
[[ "$(cat "$HOME/Desktop/work/CLAUDE.md")" == "local rules" ]] || fail "claude-home restore overwrote an existing file"

# --- export is the reverse, driven by claude-home.list ------------------------
printf '%s\n' '.claude/skills/x' 'Desktop/work/CLAUDE.md' > "$BRAIN_DIR/bin/state/claude-home.list"
printf 'edited skill\n' > "$HOME/.claude/skills/x/SKILL.md"
"$REPO_ROOT/scripts/export-claude-private.sh" >/dev/null
[[ "$(cat "$priv/.claude/skills/x/SKILL.md")" == "edited skill" ]] || fail "export did not overwrite"
[[ "$(cat "$priv/Desktop/work/CLAUDE.md")" == "local rules" ]] || fail "export missed a listed file"

# --- overlay merges in the brain phase ---------------------------------------
printf '{"autoMode":{"allow":["x"]}}\n' > "$BRAIN_DIR/bin/state/claude-settings.overlay.json"
printf '{}\n' > "$HOME/.claude/settings.json"
"$REPO_ROOT/scripts/install-brain.sh" >/dev/null
assert_contains "$(cat "$HOME/.claude/settings.json")" autoMode

# --- BRAIN_REPO clones instead of copying the template -----------------------
if command -v git >/dev/null; then
  src="$HOME/brain-src"; git init -q "$src"; printf 'marker\n' > "$src/MARKER"
  git -C "$src" add MARKER
  git -C "$src" -c user.name=t -c user.email=t@t commit -q -m seed
  BRAIN_DIR="$HOME/cloned/brain" BRAIN_REPO="$src" "$REPO_ROOT/scripts/install-brain.sh" >/dev/null
  [[ -f "$HOME/cloned/brain/MARKER" ]] || fail "BRAIN_REPO was not cloned"
fi

# --- generic agents are installed --------------------------------------------
HOME="$HOME/fresh" ; mkdir -p "$HOME"
PATH="$TEST_ROOT/bin:$PATH" bash -c 'command -v claude >/dev/null' || { printf '#!/bin/sh\n' > "$TEST_ROOT/bin/claude"; chmod +x "$TEST_ROOT/bin/claude"; }
for t in codex; do [[ -x "$TEST_ROOT/bin/$t" ]] || { printf '#!/bin/sh\n' > "$TEST_ROOT/bin/$t"; chmod +x "$TEST_ROOT/bin/$t"; }; done
"$REPO_ROOT/scripts/install-ai-tools.sh" >/dev/null 2>&1
for a in dev reviewer runner scout sim-qa; do [[ -f "$HOME/.claude/agents/$a.md" ]] || fail "agent not installed: $a"; done

printf 'PASS brain_test\n'
