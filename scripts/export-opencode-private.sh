#!/usr/bin/env bash
# Copy private OpenCode files from $HOME into the private brain (reverse of the restore in
# install-brain.sh). Reads $HOME-relative paths, one per line, from
# $brain_dir/bin/state/opencode-home.list and writes them under bin/state/opencode-home/config/.
# Public files (config/opencode/ in this repo) must never be listed.
set -uo pipefail
DOTFILES_DIR="${DOTFILES_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
source "$DOTFILES_DIR/scripts/lib.sh"
brain_dir="${BRAIN_DIR:-$HOME/Obsidian/brain}"
list="$brain_dir/bin/state/opencode-home.list"
dest="$brain_dir/bin/state/opencode-home/config"
[[ -f "$list" ]] || die "missing list: $list (one \$HOME-relative path per line)"
while IFS= read -r rel || [[ -n "$rel" ]]; do
  [[ -z "$rel" || "$rel" == \#* ]] && continue
  rel="${rel#/}"
  src="$HOME/$rel"
  if [[ ! -e "$src" ]]; then warn "skipping missing: $src"; continue; fi
  ensure_dir "$dest/$(dirname "$rel")"
  run cp "$src" "$dest/$rel"
  success "exported: $rel"
done < "$list"
