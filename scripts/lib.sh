#!/usr/bin/env bash

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info() { printf "${BLUE}[INFO]${NC} %s\n" "$*"; }
success() { printf "${GREEN}[OK]${NC} %s\n" "$*"; }
warn() { printf "${YELLOW}[WARN]${NC} %s\n" "$*"; }
error() { printf "${RED}[ERROR]${NC} %s\n" "$*" >&2; }
header() { printf "\n${BLUE}==> %s${NC}\n" "$*"; }
die() { error "$*"; exit 1; }
command_exists() { command -v "$1" >/dev/null 2>&1; }

detect_os() {
  ARCH="$(uname -m)"
  case "$(uname -s)" in
    Darwin) OS=macos; [[ "$ARCH" == arm64 ]] && HOMEBREW_PREFIX=/opt/homebrew || HOMEBREW_PREFIX=/usr/local ;;
    Linux) OS=linux; HOMEBREW_PREFIX=/home/linuxbrew/.linuxbrew ;;
    *) die "Unsupported OS: $(uname -s)" ;;
  esac
  export OS ARCH HOMEBREW_PREFIX
}

quote_cmd() { local arg; for arg in "$@"; do printf '%q ' "$arg"; done; printf '\n'; }
run() {
  if [[ "${DRY_RUN:-0}" == 1 ]]; then printf '[DRY-RUN] '; quote_cmd "$@"; return 0; fi
  "$@"
}
ensure_dir() { [[ -d "$1" ]] || run mkdir -p "$1"; }
backup_root() { printf '%s/.dotfiles_backup/%s' "$HOME" "${DOTFILES_BACKUP_ID:-$(date +%Y%m%d_%H%M%S)}"; }
backup_path() {
  local target="$1" root base
  [[ -e "$target" || -L "$target" ]] || return 0
  root="$(backup_root)"; base="${target#$HOME/}"
  ensure_dir "$root/$(dirname "$base")"
  run mv "$target" "$root/$base"
}
link_file() {
  local src="$1" dst="$2"
  if [[ -L "$dst" && "$(readlink "$dst")" == "$src" ]]; then info "already linked: $dst"; return 0; fi
  backup_path "$dst"; ensure_dir "$(dirname "$dst")"; run ln -s "$src" "$dst"
  success "linked: $dst"
}
copy_template() {
  local src="$1" dst="$2"
  [[ -e "$dst" ]] && { info "preserving existing: $dst"; return 0; }
  ensure_dir "$(dirname "$dst")"; run cp "$src" "$dst"
}
