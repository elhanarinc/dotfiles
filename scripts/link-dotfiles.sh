#!/usr/bin/env bash
set -uo pipefail
DOTFILES_DIR="${DOTFILES_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
source "$DOTFILES_DIR/scripts/lib.sh"
detect_os

link_file "$DOTFILES_DIR/.zshrc" "$HOME/.zshrc"
link_file "$DOTFILES_DIR/.aliases" "$HOME/.aliases"
link_file "$DOTFILES_DIR/.gitconfig" "$HOME/.gitconfig"
link_file "$DOTFILES_DIR/.vimrc" "$HOME/.vimrc"
link_file "$DOTFILES_DIR/.inputrc" "$HOME/.inputrc"
link_file "$DOTFILES_DIR/.tmux.conf" "$HOME/.tmux.conf"
link_file "$DOTFILES_DIR/.bash_profile" "$HOME/.bash_profile"
link_file "$DOTFILES_DIR/.config/starship.toml" "$HOME/.config/starship.toml"
link_file "$DOTFILES_DIR/.config/ghostty/config" "$HOME/.config/ghostty/config"
link_file "$DOTFILES_DIR/.vim/colors" "$HOME/.vim/colors"
link_file "$DOTFILES_DIR/ssh/config" "$HOME/.ssh/config"

if [[ "$OS" == macos ]]; then vscode="$HOME/Library/Application Support/Code/User"; else vscode="$HOME/.config/Code/User"; fi
link_file "$DOTFILES_DIR/.config/Code/User/settings.json" "$vscode/settings.json"
link_file "$DOTFILES_DIR/.config/Code/User/mcp.json" "$vscode/mcp.json"
if [[ -d "$DOTFILES_DIR/.config/Code/User/snippets" ]]; then
  for f in "$DOTFILES_DIR/.config/Code/User/snippets"/*; do [[ -e "$f" ]] && link_file "$f" "$vscode/snippets/$(basename "$f")"; done
fi
copy_template "$DOTFILES_DIR/.zshrc.local.example" "$HOME/.zshrc.local"
copy_template "$DOTFILES_DIR/.gitconfig.local.example" "$HOME/.gitconfig.local"
