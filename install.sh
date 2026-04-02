#!/usr/bin/env bash
# install.sh — Idempotent dotfiles bootstrap
# Safe to run multiple times. Works on macOS and Linux.
# Usage: ./install.sh

set -euo pipefail

DOTFILES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="$HOME/.dotfiles_backup/$(date +%Y%m%d_%H%M%S)"
NVM_VERSION="v0.40.1"

# ============================================================
# Colors & helpers
# ============================================================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }
header()  { echo -e "\n${BOLD}${BLUE}==> $*${NC}"; }
command_exists() { command -v "$1" &>/dev/null; }

# ============================================================
# OS detection
# ============================================================
detect_os() {
  header "Detecting OS"
  if [[ "$(uname)" == "Darwin" ]]; then
    OS="macos"
    ARCH="$(uname -m)"
    if [[ "$ARCH" == "arm64" ]]; then
      HOMEBREW_PREFIX="/opt/homebrew"
    else
      HOMEBREW_PREFIX="/usr/local"
    fi
    success "macOS detected (${ARCH}), Homebrew prefix: ${HOMEBREW_PREFIX}"
  elif [[ "$(uname)" == "Linux" ]]; then
    OS="linux"
    HOMEBREW_PREFIX="/home/linuxbrew/.linuxbrew"
    success "Linux detected"
  else
    error "Unsupported OS: $(uname)"
    exit 1
  fi
}

# ============================================================
# Homebrew (macOS only)
# ============================================================
install_homebrew() {
  [[ "$OS" != "macos" ]] && return 0
  header "Homebrew"
  if command_exists brew; then
    info "Homebrew already installed, skipping"
    return 0
  fi
  info "Installing Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  eval "$($HOMEBREW_PREFIX/bin/brew shellenv)"
  success "Homebrew installed"
}

# ============================================================
# Brew packages (macOS only)
# ============================================================
install_brew_packages() {
  [[ "$OS" != "macos" ]] && return 0
  header "Homebrew Packages"
  if [[ ! -f "$DOTFILES_DIR/Brewfile" ]]; then
    warn "No Brewfile found, skipping"
    return 0
  fi
  if ! command_exists brew; then
    warn "brew not found, skipping package install"
    return 0
  fi
  info "Installing packages from Brewfile (this may take a while)..."
  brew bundle install --file="$DOTFILES_DIR/Brewfile" --no-lock
  success "Brew packages installed"
}

# ============================================================
# Linux packages
# ============================================================
install_linux_packages() {
  [[ "$OS" != "linux" ]] && return 0
  header "Linux Packages"
  if command_exists apt-get; then
    info "Installing packages via apt..."
    sudo apt-get update -qq
    sudo apt-get install -y \
      curl wget git vim tmux ripgrep jq zsh \
      build-essential unzip tar
    # bat (may be batcat on Ubuntu)
    if ! command_exists bat && ! command_exists batcat; then
      sudo apt-get install -y bat 2>/dev/null || true
    fi
    # eza (not in all apt repos)
    if ! command_exists eza; then
      if sudo apt-get install -y eza 2>/dev/null; then
        true
      else
        warn "eza not available via apt, install manually: https://github.com/eza-community/eza"
      fi
    fi
    # delta
    if ! command_exists delta; then
      local delta_deb
      delta_deb=$(mktemp /tmp/delta-XXXXXX.deb)
      curl -sL "https://github.com/dandavison/delta/releases/download/0.18.2/git-delta_0.18.2_amd64.deb" -o "$delta_deb"
      sudo dpkg -i "$delta_deb" && rm -f "$delta_deb" || warn "Could not install delta"
    fi
    # zoxide
    if ! command_exists zoxide; then
      curl -sSfL https://raw.githubusercontent.com/ajeetdsouza/zoxide/main/install.sh | sh || warn "Could not install zoxide"
    fi
    # starship is installed separately
  elif command_exists dnf; then
    info "Installing packages via dnf..."
    sudo dnf install -y curl wget git vim tmux jq zsh ripgrep
  else
    warn "Neither apt nor dnf found. Install packages manually."
  fi
  success "Linux packages installed"
}

# ============================================================
# Oh-My-Zsh
# ============================================================
install_omz() {
  header "Oh-My-Zsh"
  if [[ -d "$HOME/.oh-my-zsh" ]]; then
    info "Oh-My-Zsh already installed, skipping"
    return 0
  fi
  info "Installing Oh-My-Zsh..."
  # --unattended prevents OMZ from overwriting our .zshrc
  RUNZSH=no CHSH=no sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended
  success "Oh-My-Zsh installed"
}

# ============================================================
# Oh-My-Zsh plugins
# ============================================================
install_omz_plugins() {
  header "Oh-My-Zsh Plugins"
  local plugins_dir="${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/plugins"
  mkdir -p "$plugins_dir"

  declare -A PLUGINS=(
    ["zsh-autosuggestions"]="https://github.com/zsh-users/zsh-autosuggestions"
    ["zsh-syntax-highlighting"]="https://github.com/zsh-users/zsh-syntax-highlighting"
    ["fzf-tab"]="https://github.com/Aloxaf/fzf-tab"
    ["you-should-use"]="https://github.com/MichaelAquilina/zsh-you-should-use"
  )

  for plugin in "${!PLUGINS[@]}"; do
    if [[ -d "$plugins_dir/$plugin" ]]; then
      info "Plugin '$plugin' already installed, skipping"
    else
      info "Installing plugin: $plugin"
      git clone --depth=1 "${PLUGINS[$plugin]}" "$plugins_dir/$plugin"
      success "Installed: $plugin"
    fi
  done
}

# ============================================================
# Starship prompt
# ============================================================
install_starship() {
  header "Starship Prompt"
  if command_exists starship; then
    info "Starship already installed, skipping"
    return 0
  fi
  info "Installing Starship..."
  if [[ "$OS" == "macos" ]] && command_exists brew; then
    brew install starship
  else
    curl -sS https://starship.rs/install.sh | sh -s -- --yes
  fi
  success "Starship installed"
}

# ============================================================
# NVM
# ============================================================
install_nvm() {
  header "NVM (Node Version Manager)"
  if [[ -d "$HOME/.nvm" ]]; then
    info "NVM already installed, skipping"
    return 0
  fi
  info "Installing NVM ${NVM_VERSION}..."
  curl -o- "https://raw.githubusercontent.com/nvm-sh/nvm/${NVM_VERSION}/install.sh" | bash
  success "NVM installed"
}

# ============================================================
# Dev formatters (goimports, autopep8, black, isort, mypy)
# ============================================================
install_dev_formatters() {
  header "Dev Formatters"

  # goimports (Go formatter for Zed)
  if command_exists go; then
    if ! command_exists goimports; then
      info "Installing goimports..."
      go install golang.org/x/tools/cmd/goimports@latest
      success "goimports installed"
    else
      info "goimports already installed, skipping"
    fi
  else
    warn "go not found, skipping goimports"
  fi

  # Python formatters (autopep8, black, isort, mypy)
  local pip_cmd
  if command_exists pip3; then
    pip_cmd="pip3"
  elif command_exists pip; then
    pip_cmd="pip"
  else
    warn "pip not found, skipping Python formatters"
    return 0
  fi

  local python_tools=(autopep8 black isort mypy)
  for tool in "${python_tools[@]}"; do
    if ! command_exists "$tool"; then
      info "Installing $tool..."
      "$pip_cmd" install --quiet "$tool"
      success "$tool installed"
    else
      info "$tool already installed, skipping"
    fi
  done
}

# ============================================================
# Tmux Plugin Manager (tpm)
# ============================================================
install_tpm() {
  header "Tmux Plugin Manager (tpm)"
  local tpm_dir="$HOME/.tmux/plugins/tpm"
  if [[ -d "$tpm_dir" ]]; then
    info "tpm already installed, skipping"
    return 0
  fi
  info "Installing tpm..."
  git clone --depth=1 https://github.com/tmux-plugins/tpm "$tpm_dir"
  success "tpm installed — run prefix+I inside tmux to install plugins"
}

# ============================================================
# fzf shell integration (if installed via brew)
# ============================================================
setup_fzf() {
  header "fzf Shell Integration"
  if command_exists fzf; then
    local fzf_prefix
    if command_exists brew; then
      fzf_prefix="$(brew --prefix fzf 2>/dev/null || echo '')"
    fi
    if [[ -n "${fzf_prefix:-}" ]] && [[ -f "$fzf_prefix/install" ]]; then
      if [[ ! -f "$HOME/.fzf.zsh" ]]; then
        info "Setting up fzf shell integration..."
        "$fzf_prefix/install" --key-bindings --completion --no-update-rc
        success "fzf shell integration configured"
      else
        info "fzf shell integration already configured, skipping"
      fi
    fi
  else
    info "fzf not found, skipping shell integration"
  fi
}

# ============================================================
# Symlinks
# ============================================================
backup_and_link() {
  local src="$1"
  local dst="$2"

  # Skip if already correctly symlinked
  if [[ -L "$dst" ]] && [[ "$(readlink "$dst")" == "$src" ]]; then
    info "Already linked: $dst"
    return 0
  fi

  # Backup if exists and is not our symlink
  if [[ -e "$dst" ]] || [[ -L "$dst" ]]; then
    mkdir -p "$BACKUP_DIR"
    info "Backing up: $dst -> $BACKUP_DIR/"
    mv "$dst" "$BACKUP_DIR/"
  fi

  # Create parent directory if needed
  mkdir -p "$(dirname "$dst")"

  ln -sf "$src" "$dst"
  success "Linked: $dst"
}

create_symlinks() {
  header "Creating Symlinks"

  backup_and_link "$DOTFILES_DIR/.zshrc"              "$HOME/.zshrc"
  backup_and_link "$DOTFILES_DIR/.aliases"            "$HOME/.aliases"
  backup_and_link "$DOTFILES_DIR/.gitconfig"          "$HOME/.gitconfig"
  backup_and_link "$DOTFILES_DIR/.vimrc"              "$HOME/.vimrc"
  backup_and_link "$DOTFILES_DIR/.inputrc"            "$HOME/.inputrc"
  backup_and_link "$DOTFILES_DIR/.tmux.conf"          "$HOME/.tmux.conf"

  # Starship config
  mkdir -p "$HOME/.config"
  backup_and_link "$DOTFILES_DIR/.config/starship.toml" "$HOME/.config/starship.toml"

  # Zed editor config
  mkdir -p "$HOME/.config/zed"
  backup_and_link "$DOTFILES_DIR/.config/zed/settings.json" "$HOME/.config/zed/settings.json"
  backup_and_link "$DOTFILES_DIR/.config/zed/keymap.json"   "$HOME/.config/zed/keymap.json"
  backup_and_link "$DOTFILES_DIR/.config/zed/tasks.json"    "$HOME/.config/zed/tasks.json"

  # Ghostty terminal config
  mkdir -p "$HOME/.config/ghostty"
  backup_and_link "$DOTFILES_DIR/.config/ghostty/config" "$HOME/.config/ghostty/config"

  # Vim colors directory
  mkdir -p "$HOME/.vim"
  backup_and_link "$DOTFILES_DIR/.vim/colors"         "$HOME/.vim/colors"

  success "All symlinks created"
}

# ============================================================
# Local config
# ============================================================
setup_local_config() {
  header "Local Config (~/.zshrc.local)"
  if [[ -f "$HOME/.zshrc.local" ]]; then
    info "~/.zshrc.local already exists, skipping"
    return 0
  fi
  info "Creating ~/.zshrc.local from example template..."
  cp "$DOTFILES_DIR/.zshrc.local.example" "$HOME/.zshrc.local"
  warn "IMPORTANT: Edit ~/.zshrc.local to add your machine-specific config!"
  warn "           Move GEMINI_API_KEY and other secrets there."
}

# ============================================================
# Post-install message
# ============================================================
post_install_message() {
  echo ""
  echo -e "${BOLD}${GREEN}============================================${NC}"
  echo -e "${BOLD}${GREEN}  Dotfiles installation complete!${NC}"
  echo -e "${BOLD}${GREEN}============================================${NC}"
  echo ""
  echo -e "${BOLD}Next steps:${NC}"
  echo "  1. Restart your terminal (or run: exec zsh)"
  echo "  2. Edit ~/.zshrc.local with your machine-specific config:"
  echo "       - Add GEMINI_API_KEY and other API keys"
  echo "       - Add Google Cloud SDK paths"
  echo "       - Add Windsurf/Antigravity/OpenCode paths"
  echo "  3. Set your terminal font to a Nerd Font for icons:"
  echo "       Ghostty: font is pre-configured via .config/ghostty/config"
  echo "       Other terminals: set JetBrains Mono Nerd Font in preferences"
  echo "  4. Install the Catppuccin theme in Zed:"
  echo "       cmd+shift+p → 'zed: extensions' → search 'Catppuccin Themes'"
  echo "  5. Inside tmux, run prefix+I to install tpm plugins (resurrect, continuum)"
  echo ""
  echo -e "${BOLD}Installed plugins (oh-my-zsh):${NC}"
  echo "  - zsh-autosuggestions   (fish-like suggestions)"
  echo "  - zsh-syntax-highlighting (command coloring)"
  echo "  - fzf-tab               (fuzzy tab completion)"
  echo "  - you-should-use        (alias reminders)"
  echo "  - kubectl               (k8s completion)"
  echo ""
  echo -e "${BOLD}New tools to try:${NC}"
  echo "  ls    → eza (with icons and git status)"
  echo "  cat   → bat (syntax highlighting)"
  echo "  cd    → zoxide (smart frecency navigation: 'cd project')"
  echo "  grep  → rg  (ripgrep, much faster)"
  echo "  git diff → delta pager (side-by-side diffs)"
  echo ""
  if [[ -f "$HOME/.gitconfig" ]]; then
    warn "Security: Move any API keys from your old .zshrc to ~/.zshrc.local"
  fi
  echo ""
}

# ============================================================
# Main
# ============================================================
main() {
  echo -e "${BOLD}${BLUE}"
  echo "  ██████╗  ██████╗ ████████╗███████╗██╗██╗     ███████╗███████╗"
  echo "  ██╔══██╗██╔═══██╗╚══██╔══╝██╔════╝██║██║     ██╔════╝██╔════╝"
  echo "  ██║  ██║██║   ██║   ██║   █████╗  ██║██║     █████╗  ███████╗"
  echo "  ██║  ██║██║   ██║   ██║   ██╔══╝  ██║██║     ██╔══╝  ╚════██║"
  echo "  ██████╔╝╚██████╔╝   ██║   ██║     ██║███████╗███████╗███████║"
  echo "  ╚═════╝  ╚═════╝    ╚═╝   ╚═╝     ╚═╝╚══════╝╚══════╝╚══════╝"
  echo -e "${NC}"
  echo "  Dotfiles installer — safe to run multiple times"
  echo ""

  detect_os
  install_homebrew
  install_brew_packages
  install_linux_packages
  install_omz
  install_omz_plugins
  install_starship
  install_nvm
  install_tpm
  install_dev_formatters
  setup_fzf
  create_symlinks
  setup_local_config
  post_install_message
}

main "$@"
