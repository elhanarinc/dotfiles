#!/usr/bin/env bash
# Copy private Claude files from $HOME into the private brain (reverse of the restore in
# install-brain.sh). Reads $HOME-relative paths, one per line (files or directories), from
# $brain_dir/bin/state/claude-home.list and overwrites them inside bin/state/claude-home/.
set -uo pipefail
DOTFILES_DIR="${DOTFILES_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
source "$DOTFILES_DIR/scripts/lib.sh"
brain_dir="${BRAIN_DIR:-$HOME/Obsidian/brain}"
list="$brain_dir/bin/state/claude-home.list"
dest="$brain_dir/bin/state/claude-home"
[[ -f "$list" ]] || die "missing list: $list (one \$HOME-relative path per line)"
while IFS= read -r rel || [[ -n "$rel" ]]; do
  [[ -z "$rel" || "$rel" == \#* ]] && continue
  rel="${rel#/}"
  src="$HOME/$rel"
  if [[ ! -e "$src" ]]; then warn "skipping missing: $src"; continue; fi
  ensure_dir "$dest/$(dirname "$rel")"
  if [[ -d "$src" ]]; then
    ensure_dir "$dest/$rel"
    run cp -R "$src/." "$dest/$rel/"
  else
    run cp "$src" "$dest/$rel"
  fi
  success "exported: $rel"
done < "$list"
