#!/usr/bin/env bash
set -uo pipefail

DOTFILES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export DOTFILES_DIR
# shellcheck source=scripts/lib.sh
source "$DOTFILES_DIR/scripts/lib.sh"

PHASES=(brew apps shell links vscode ai brain doctor)
DRY_RUN=0
ONLY=""
SKIP=""

usage() {
  cat <<'EOF'
Usage: ./install.sh [--dry-run] [--only phase,...] [--skip phase,...] [--help]

Phases: brew, apps, shell, links, vscode, ai, brain, doctor

  --dry-run       Print planned changes without changing the machine
  --only LIST     Run only comma-separated phases
  --skip LIST     Skip comma-separated phases
EOF
}

contains_csv() { [[ ",$1," == *",$2,"* ]]; }
valid_phase() { local p; for p in "${PHASES[@]}"; do [[ "$p" == "$1" ]] && return 0; done; return 1; }
validate_list() {
  local list="$1" item old_ifs="$IFS"
  IFS=,
  for item in $list; do valid_phase "$item" || die "Unknown phase: $item (valid: ${PHASES[*]})"; done
  IFS="$old_ifs"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --only) [[ $# -ge 2 ]] || die "--only requires a value"; ONLY="$2"; shift ;;
    --skip) [[ $# -ge 2 ]] || die "--skip requires a value"; SKIP="$2"; shift ;;
    --help|-h) usage; exit 0 ;;
    *) die "Unknown option: $1" ;;
  esac
  shift
done
[[ -n "$ONLY" ]] && validate_list "$ONLY"
[[ -n "$SKIP" ]] && validate_list "$SKIP"
export DRY_RUN
detect_os

run_phase() {
  local phase="$1"
  case "$phase" in
    brew|apps) "$DOTFILES_DIR/scripts/install-brew.sh" "$phase" ;;
    shell) "$DOTFILES_DIR/scripts/install-shell.sh" ;;
    links) "$DOTFILES_DIR/scripts/link-dotfiles.sh" ;;
    vscode) "$DOTFILES_DIR/scripts/install-dev-tools.sh" ;;
    ai) "$DOTFILES_DIR/scripts/install-ai-tools.sh" ;;
    brain) "$DOTFILES_DIR/scripts/install-brain.sh" ;;
    doctor) "$DOTFILES_DIR/scripts/doctor.sh" ;;
  esac
}

info "dotfiles bootstrap ($OS/$ARCH)$([[ "$DRY_RUN" == 1 ]] && printf ' — DRY RUN')"
failures=0
for phase in "${PHASES[@]}"; do
  [[ -n "$ONLY" ]] && ! contains_csv "$ONLY" "$phase" && continue
  [[ -n "$SKIP" ]] && contains_csv "$SKIP" "$phase" && continue
  header "$phase"
  run_phase "$phase" || { error "phase failed: $phase"; failures=$((failures + 1)); }
done

if [[ $failures -gt 0 ]]; then
  error "$failures required phase(s) failed"
  exit 1
fi
success "$([[ "$DRY_RUN" == 1 ]] && printf 'dry-run' || printf 'installation') completed"
