#!/usr/bin/env bash
set -uo pipefail
DOTFILES_DIR="${DOTFILES_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
source "$DOTFILES_DIR/scripts/lib.sh"
if command_exists go && ! command_exists goimports; then run go install golang.org/x/tools/cmd/goimports@latest; fi
if command_exists uv; then
  for tool in autopep8 black isort mypy; do command_exists "$tool" || run uv tool install "$tool"; done
else warn "uv unavailable; Python formatter installation skipped"; fi
if ! command_exists code; then warn "code CLI unavailable; install it from VS Code Command Palette"; exit 0; fi
if [[ "${DRY_RUN:-0}" == 1 ]]; then
  while IFS= read -r ext; do
    [[ -z "$ext" || "$ext" == \#* ]] && continue
    info "would ensure VS Code extension: $ext"
  done < "$DOTFILES_DIR/.config/Code/extensions.txt"
  exit 0
fi
installed="$(code --list-extensions 2>/dev/null || true)"
while IFS= read -r ext; do
  [[ -z "$ext" || "$ext" == \#* ]] && continue
  printf '%s\n' "$installed" | grep -qix "$ext" || run code --install-extension "$ext" --force
done < "$DOTFILES_DIR/.config/Code/extensions.txt"
