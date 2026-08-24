#!/usr/bin/env bash
#
# install-git-hooks.sh [target-repo] — symlink this repo's git-hooks/ into a
# target repository's .git/hooks/. Opt-in and per-repo on purpose: a global
# core.hooksPath would disable every repo's own hooks (husky, lefthook, ...).
#
# Existing non-symlink hooks are left untouched and reported, never overwritten.
set -uo pipefail
DOTFILES_DIR="${DOTFILES_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
TARGET="${1:-$PWD}"

hooks_dir="$(git -C "$TARGET" rev-parse --git-path hooks 2>/dev/null)" || {
  echo "not a git repository: $TARGET" >&2; exit 1
}
[[ "$hooks_dir" = /* ]] || hooks_dir="$TARGET/$hooks_dir"
mkdir -p "$hooks_dir"

for src in "$DOTFILES_DIR"/git-hooks/*; do
  [[ -f "$src" ]] || continue
  name="$(basename "$src")"
  dest="$hooks_dir/$name"
  if [[ -L "$dest" ]]; then
    ln -sfn "$src" "$dest"; echo "relinked: $name"
  elif [[ -e "$dest" ]]; then
    echo "SKIP (existing real file, not overwritten): $dest" >&2
  else
    ln -s "$src" "$dest"; echo "linked:   $name"
  fi
done
