#!/usr/bin/env bash
set -uo pipefail
source "${DOTFILES_DIR:?}/scripts/lib.sh"
detect_os
if [[ "$OS" == linux ]]; then
  if command_exists apt-get; then run sudo apt-get update; run sudo apt-get install -y curl git vim tmux ripgrep jq zsh build-essential unzip; else warn "Linux package manager unsupported"; fi
fi
if [[ ! -d "$HOME/.oh-my-zsh" ]]; then
  if [[ "${DRY_RUN:-0}" == 1 ]]; then info "would install Oh My Zsh unattended"; else RUNZSH=no CHSH=no sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended; fi
fi
plugins_dir="${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/plugins"
names="zsh-autosuggestions zsh-syntax-highlighting fzf-tab you-should-use"
urls="https://github.com/zsh-users/zsh-autosuggestions https://github.com/zsh-users/zsh-syntax-highlighting https://github.com/Aloxaf/fzf-tab https://github.com/MichaelAquilina/zsh-you-should-use"
set -- $urls; for name in $names; do url="$1"; shift; [[ -d "$plugins_dir/$name" ]] || { ensure_dir "$plugins_dir"; run git clone --depth=1 "$url" "$plugins_dir/$name"; }; done
[[ -d "$HOME/.nvm" ]] || { if [[ "${DRY_RUN:-0}" == 1 ]]; then info "would install nvm v0.40.1"; else curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash; fi; }
[[ -d "$HOME/.tmux/plugins/tpm" ]] || run git clone --depth=1 https://github.com/tmux-plugins/tpm "$HOME/.tmux/plugins/tpm"
