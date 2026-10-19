#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/test_helper.sh"
# doctor.sh reads the shell files from DOTFILES_DIR, so run it against a copy
# whose .bash_profile carries Docker Desktop's installer block verbatim.
fake="$TEST_ROOT/dotfiles"; mkdir -p "$fake"; cp -R "$REPO_ROOT/scripts" "$fake/"
cp "$REPO_ROOT/.zshrc" "$REPO_ROOT/.bash_profile" "$fake/"
export DOTFILES_DIR="$fake" DRY_RUN=1
clean_out="$("$fake/scripts/doctor.sh" 2>&1)"
assert_contains "$clean_out" "no installer appends in tracked shell files"
printf '# The following lines were added by Docker Desktop to add commands to your PATH.\nexport PATH="$PATH:$HOME/.docker/bin"\n# End of Docker Desktop section.\n' > "$fake/.bash_profile"
dirty_out="$("$fake/scripts/doctor.sh" 2>&1)"
assert_contains "$dirty_out" "an installer appended to a tracked shell file"
printf 'PASS doctor_test\n'
