# Brewfile — macOS package manifest
# Usage: brew bundle install
# Run from dotfiles directory or pass: brew bundle --file=path/to/Brewfile

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
brew "git-delta"        # Better git diff pager (formula is git-delta; `delta` is its alias)
brew "fd"               # Better find
brew "difftastic"       # Structural (syntax-aware) diff — `git dft`
brew "jless"            # Interactive JSON viewer

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
brew "shellcheck"       # Shell script validation
brew "uv"               # Fast Python package/tool manager
brew "just"             # Per-repo task runner (justfile)
brew "gitleaks"         # Secret scanner — wired as the pre-push hook
brew "direnv"           # Per-project environment via .envrc

# ============================================================
# Formatters (used by VSCode on save)
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
# iOS / App Store release toolchain
# Load-bearing for the shipped iOS app: without these a fresh machine can
# generate no project, resolve no pods and publish no build.
# ============================================================
brew "xcodegen"         # Generate .xcodeproj from project.yml
brew "cocoapods"        # iOS dependency manager
brew "asc"              # App Store Connect CLI (upload, metadata, releases)
brew "sentry-cli"       # Upload dSYMs / create releases
brew "create-dmg"       # Build a distributable .dmg
brew "fileicon"         # Set custom file/folder icons on build artifacts

# XcodeBuildMCP CLI: agent-facing wrapper over xcodebuild/simctl (build, run,
# test, log, UI automation). Third-party tap, so a fresh machine needs
# `brew trust getsentry/xcodebuildmcp` before `brew bundle` can load the
# formula — `brew bundle` cannot express tap trust on its own.
tap "getsentry/xcodebuildmcp"
brew "getsentry/xcodebuildmcp/xcodebuildmcp"

# ============================================================
# Cloud & DevOps
# ============================================================
brew "awscli"           # AWS CLI
brew "kubernetes-cli"   # Kubernetes CLI (formula is kubernetes-cli; `kubectl` is its alias)
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
brew "pandoc"           # Document conversion
brew "poppler"          # PDF utilities
brew "qpdf"             # PDF inspection and transformation
brew "ffmpeg"           # Audio/video processing
brew "imagemagick"      # Image processing
brew "pngquant"         # Lossy PNG compression — App Store screenshots, web assets
brew "gifsicle"         # GIF optimisation/resize
brew "zopfli"           # Zlib-compatible recompression (smallest PNG/gzip)
brew "watchman"         # Filesystem watcher

# ============================================================
# Fonts (for starship / eza icons — set in terminal preferences)
# ============================================================
cask "font-jetbrains-mono-nerd-font"
cask "font-fira-code-nerd-font"

# ============================================================
# Editors & terminals
# ============================================================
cask "visual-studio-code"  # VSCode editor (config: .config/Code/User/)
cask "ghostty"             # Ghostty terminal (config: .config/ghostty/)
cask "iterm2"              # Terminal fallback

# ============================================================
# Workstation applications (configuration only; login manually)
# ============================================================
# NOTE: the `docker` cask is now the Docker CLI only — Docker Desktop moved to
# `docker-desktop`. Do NOT run `--adopt` on either: adopting `docker` triggers a
# migration that REMOVES an existing /Applications/Docker.app, and installing
# `docker-desktop` needs an interactive sudo for /usr/local/cli-plugins.
cask "docker-desktop"       # Docker Desktop (install interactively: brew install --cask docker-desktop)
cask "google-chrome"        # Browser
cask "spotify"              # Music
cask "slack"                # Team communication
cask "obsidian"             # Knowledge base
cask "postman"              # API client
cask "headlamp"             # Kubernetes desktop client (replaced Lens)
cask "caffeine"             # Keep Mac awake (installed copy is 1.6.4 vs cask 1.1.4 — cannot --adopt)
cask "chatgpt"              # ChatGPT desktop
cask "claude"               # Claude desktop

# General-purpose utilities used on the current workstation
cask "maccy"                # Clipboard manager
cask "jordanbaird-ice"      # Menu bar manager
cask "hiddenbar"            # Lightweight menu bar utility
cask "tablepro"             # Database client (TablePro; TablePlus was never installed here).
                            # Installed copy is 0.27.2 vs cask 0.67.1 — cannot --adopt; upgrade in-app first.
cask "react-native-debugger"
cask "android-platform-tools"
cask "codex"                # Codex CLI
cask "codexbar"             # Codex menu-bar companion

# ============================================================
# Java
# ============================================================
cask "zulu@17"          # Azul Zulu JDK 17 (LTS)

# ============================================================
# Machine extras — present on the current workstation but deliberately NOT part
# of the bootstrap. Uncomment individually if a new machine actually needs one.
# ============================================================
# brew "ollama"           # Local LLM runner
# brew "rust"             # Rust toolchain (rustup is usually preferable)
# brew "nginx"            # Local reverse proxy
# brew "prometheus"       # Metrics server
# brew "flyway"           # Database migrations
# brew "tectonic"         # Self-contained TeX engine
# brew "terraformer"      # Generate Terraform from existing infrastructure
# brew "terracognita"     # Same, alternative implementation
# brew "mysql"            # Full MySQL server (mysql-client above is usually enough)
# brew "speedtest"        # Ookla speedtest CLI (tap: teamookla/speedtest)
# brew "ghostscript"      # PostScript/PDF interpreter
# brew "librsvg"          # SVG rasterisation
# brew "libmagic"         # File type detection library
# brew "libimobiledevice" # Talk to iOS devices over USB
# brew "cliclick"         # Scripted mouse/keyboard clicks
# brew "innoextract"      # Extract Inno Setup installers
# brew "python-tk@3.10"   # Tk bindings for Python 3.10
# cask "love"             # LÖVE 2D game framework
