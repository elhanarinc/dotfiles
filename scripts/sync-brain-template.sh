#!/usr/bin/env bash
# Copy the installed brain's portable scripts back into brain-template so the repository and
# the machine cannot drift. Copies *.mjs only: no notes, no state, no machine config —
# and NOT bin/docs/README.md, which is a separate portable setup manual maintained by hand.
#
#   scripts/sync-brain-template.sh            # report differences
#   scripts/sync-brain-template.sh --apply    # copy them in
set -euo pipefail
DOTFILES_DIR="${DOTFILES_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
source "$DOTFILES_DIR/scripts/lib.sh"
brain_dir="${BRAIN_DIR:-$HOME/Obsidian/brain}"
src="$brain_dir/bin/scripts"
dst="$DOTFILES_DIR/brain-template/bin/scripts"
apply=0
[[ "${1:-}" == "--apply" ]] && apply=1

[[ -d "$src" ]] || die "no installed brain at $src"

# verify.mjs is machine-specific by design and is never vendored.
changed=0
for file in "$src"/*.mjs; do
  name="$(basename "$file")"
  [[ "$name" == "verify.mjs" ]] && continue
  if [[ ! -f "$dst/$name" ]]; then
    printf 'new      %s\n' "$name"; changed=1
  elif ! cmp -s "$file" "$dst/$name"; then
    printf 'changed  %s\n' "$name"; changed=1
  else
    continue
  fi
  [[ $apply == 1 ]] && cp "$file" "$dst/$name"
done

for file in "$dst"/*.mjs; do
  name="$(basename "$file")"
  [[ -f "$src/$name" ]] || { printf 'orphan   %s (not in installed brain)\n' "$name"; changed=1; }
done

if [[ $changed -eq 0 ]]; then
  success "brain-template matches the installed brain"
elif [[ $apply -eq 1 ]]; then
  success "synced — now run: bash tests/brain_test.sh && scripts/audit-public.sh"
else
  warn "differences found; re-run with --apply"
fi
