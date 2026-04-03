# Brewfile — macOS package manifest
# Usage: brew bundle install
# Run from dotfiles directory or pass: brew bundle --file=path/to/Brewfile

# ============================================================
# Taps
# ============================================================
tap "homebrew/bundle"

# ============================================================
# Core utilities
# ============================================================
brew "coreutils"        # GNU core utilities
brew "curl"             # Data transfer
brew "wget"             # File downloader
brew "gnupg"            # GPG encryption
brew "openssh"          # SSH client/server

# ============================================================
# Modern CLI replacements
# ============================================================
brew "eza"              # Better ls (with git status, icons)
brew "bat"              # Better cat (syntax highlighting)
brew "zoxide"           # Smart cd (frecency-based)
brew "fzf"              # Fuzzy finder
brew "ripgrep"          # Better grep (rg)
brew "delta"            # Better git diff pager
brew "fd"               # Better find

# ============================================================
# Shell
# ============================================================
brew "zsh"
brew "zsh-completions"
brew "starship"         # Cross-platform shell prompt

# ============================================================
# Development utilities
# ============================================================
brew "git"
brew "gh"               # GitHub CLI
brew "jq"               # JSON processor
brew "yq"               # YAML processor
brew "htop"             # Interactive process viewer
brew "watch"            # Execute command periodically
brew "tmux"             # Terminal multiplexer
brew "vim"              # Text editor
brew "tree"             # Directory tree view
brew "lazygit"          # Terminal UI for git (used in Zed tasks)

# ============================================================
# Formatters (used by Zed on save)
# ============================================================
brew "prettier"         # JS/TS/JSON/YAML formatter
# goimports: go install golang.org/x/tools/cmd/goimports@latest  (installed in install.sh)
# autopep8/black/isort/mypy: pip install ... (installed in install.sh)

# ============================================================
# Languages & runtimes
# ============================================================
brew "go"
brew "ruby"
brew "python@3.13"
brew "node"             # System node (project-specific via nvm)

# ============================================================
# Version managers
# ============================================================
brew "pyenv"            # Python version manager
# Note: nvm installed via official curl installer in install.sh

# ============================================================
# Cloud & DevOps
# ============================================================
brew "awscli"           # AWS CLI
brew "kubectl"          # Kubernetes CLI
brew "helm"             # Kubernetes package manager
brew "eksctl"           # Amazon EKS CLI
brew "terraform"        # Infrastructure as Code
brew "nmap"             # Network scanner
brew "telnet"           # Network debugging

# ============================================================
# Data & misc
# ============================================================
brew "sqlite"           # Lightweight database
brew "mysql-client"     # MySQL CLI (no server)

# ============================================================
# Fonts (for starship / eza icons — set in terminal preferences)
# ============================================================
cask "font-jetbrains-mono-nerd-font"
cask "font-fira-code-nerd-font"

# ============================================================
# Editors & terminals
# ============================================================
cask "zed"              # Zed editor (config: .config/zed/)
cask "ghostty"          # Ghostty terminal (config: .config/ghostty/)

# ============================================================
# Java
# ============================================================
cask "zulu@17"          # Azul Zulu JDK 17 (LTS)
