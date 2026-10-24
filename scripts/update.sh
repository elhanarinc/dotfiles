#!/usr/bin/env bash
# Opt-in maintenance (`just update`): upgrade what the bootstrap installed.
# Never runs `brew bundle cleanup`. Each step skips with a warning if its tool
# is missing and a failing step never stops the following ones.
set -uo pipefail
DOTFILES_DIR="${DOTFILES_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
source "$DOTFILES_DIR/scripts/lib.sh"

step() { local name="$1"; shift; header "$name"; "$@" || warn "$name reported a problem"; }

update_brew() {
  command_exists brew || { warn "brew missing; skipping Homebrew"; return 0; }
  run nice -n 15 brew update || return 1
  run nice -n 15 brew upgrade || return 1
  run nice -n 15 brew bundle --file="$DOTFILES_DIR/Brewfile"
}
update_omz() {
  local omz="${ZSH:-$HOME/.oh-my-zsh}"
  [[ -f "$omz/tools/upgrade.sh" ]] || { warn "Oh My Zsh not installed; skipping"; return 0; }
  run env ZSH="$omz" nice -n 15 zsh "$omz/tools/upgrade.sh"
}
update_tpm() {
  local tpm="$HOME/.tmux/plugins/tpm/bin/update_plugins"
  [[ -x "$tpm" ]] || { warn "TPM not installed; skipping tmux plugins"; return 0; }
  run nice -n 15 "$tpm" all
}
update_code() {
  command_exists code || { warn "code missing; skipping VS Code extensions"; return 0; }
  run nice -n 15 code --update-extensions
}
update_claude() {
  command_exists claude || { warn "claude missing; skipping Claude marketplaces"; return 0; }
  run nice -n 15 claude plugin marketplace update
}

step "homebrew" update_brew
step "oh-my-zsh" update_omz
step "tmux plugins" update_tpm
step "vscode extensions" update_code
step "claude marketplaces" update_claude
success "update finished"
