#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_ROOT="$(mktemp -d)"
export HOME="$TEST_ROOT/home" PATH="$TEST_ROOT/bin:$PATH" DOTFILES_BACKUP_ID=test
mkdir -p "$HOME" "$TEST_ROOT/bin"
cleanup() { rm -rf "$TEST_ROOT"; }
trap cleanup EXIT
fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
assert_contains() { [[ "$1" == *"$2"* ]] || fail "expected output to contain: $2"; }
assert_not_exists() { [[ ! -e "$1" && ! -L "$1" ]] || fail "expected no path: $1"; }
assert_symlink() { [[ -L "$1" ]] || fail "expected symlink: $1"; }
stub() { printf '#!/bin/sh\nprintf "%%s\\n" "$0 $*" >> "${TEST_COMMAND_LOG}"\n' > "$TEST_ROOT/bin/$1"; chmod +x "$TEST_ROOT/bin/$1"; }
