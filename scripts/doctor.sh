#!/usr/bin/env bash
set -uo pipefail
DOTFILES_DIR="${DOTFILES_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
source "$DOTFILES_DIR/scripts/lib.sh"
detect_os
info "platform: $OS/$ARCH"
missing=0
for cmd in git zsh rg jq tmux vim starship code docker claude codex; do
  if command_exists "$cmd"; then success "$cmd"; else warn "missing: $cmd"; missing=$((missing + 1)); fi
done
brain_dir="${BRAIN_DIR:-$HOME/Obsidian/brain}"
[[ -d "$brain_dir/bin" ]] && success "living brain: $brain_dir" || warn "living brain not installed"
[[ $missing -eq 0 ]] || warn "$missing optional/recommended commands are unavailable"

# --- drift: does the Brewfile still describe this machine? ------------------
# Presence checks above cannot see a manifest that has stopped being true.
# Skipped under --dry-run: brew populates its cache under $HOME, which would
# make `install.sh --dry-run` mutate the caller's home (tests/install_test.sh).
if command_exists brew && [[ "${DRY_RUN:-0}" != 1 ]]; then
  if brew bundle check --file="$DOTFILES_DIR/Brewfile" >/dev/null 2>&1; then
    success "Brewfile satisfied"
  else
    warn "Brewfile drift — run: brew bundle check --verbose --file=Brewfile"
  fi
  outdated="$(brew outdated --quiet 2>/dev/null | wc -l | tr -d ' ')"
  if [[ "${outdated:-0}" -eq 0 ]]; then
    success "no outdated packages"
  else
    warn "$outdated outdated package(s) — run: brew outdated"
  fi
fi

# --- drift: are the managed dotfiles still symlinks to this repo? -----------
if [[ "$OS" == macos ]]; then vscode_dir="$HOME/Library/Application Support/Code/User"; else vscode_dir="$HOME/.config/Code/User"; fi
unlinked=0
for target in \
  "$HOME/.zshrc" "$HOME/.aliases" "$HOME/.gitconfig" "$HOME/.gitignore" \
  "$HOME/.vimrc" "$HOME/.inputrc" "$HOME/.tmux.conf" "$HOME/.bash_profile" \
  "$HOME/.config/starship.toml" "$HOME/.config/ghostty/config" \
  "$HOME/.ssh/config" "$vscode_dir/settings.json" "$vscode_dir/mcp.json"; do
  if [[ -L "$target" ]] && [[ "$(readlink "$target")" == "$DOTFILES_DIR"/* ]]; then
    continue
  elif [[ -e "$target" ]]; then
    warn "not linked to this repo: ${target/#$HOME/~}"
    unlinked=$((unlinked + 1))
  fi
done
[[ $unlinked -eq 0 ]] && success "all managed dotfiles are linked to this repo" \
  || warn "$unlinked managed file(s) drifted — run: ./install.sh --only links"

# --- drift: is a tracked config file being appended to by installers? -------
if grep -qE '^# (Added by|The following lines have been added)' "$DOTFILES_DIR/.zshrc" "$DOTFILES_DIR/.bash_profile" 2>/dev/null; then
  warn "an installer appended to a tracked shell file — move it to ~/.zshrc.local"
else
  success "no installer appends in tracked shell files"
fi

exit 0
