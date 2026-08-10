#!/usr/bin/env bash
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
printf 'Workstation inventory (read-only)\n'
printf 'Repository: %s\n\n' "$ROOT"
for cmd in brew git gh docker code claude codex obsidian; do
  if command -v "$cmd" >/dev/null 2>&1; then printf '[present] %s -> %s\n' "$cmd" "$(command -v "$cmd")"; else printf '[missing] %s\n' "$cmd"; fi
done
if command -v brew >/dev/null 2>&1; then
  printf '\nBrewfile status:\n'
  brew bundle check --file="$ROOT/Brewfile" || true
fi
printf '\nManaged links:\n'
for target in "$HOME/.zshrc" "$HOME/.gitconfig" "$HOME/.config/ghostty/config"; do
  if [[ -L "$target" ]]; then printf '[link] %s -> %s\n' "$target" "$(readlink "$target")"; else printf '[local] %s\n' "$target"; fi
done
