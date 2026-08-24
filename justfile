# dotfiles task runner — `just` with no arguments lists every recipe.
# Recipes wrap the read-only checks and the opt-in installers so the exact
# invocations don't have to be remembered.

default:
    @just --list

# Read-only: presence checks, Brewfile drift, outdated count, symlink audit
doctor:
    ./scripts/doctor.sh

# Read-only: reject secrets, absolute user paths and company names
audit:
    ./scripts/audit-public.sh

# Read-only: what this machine actually has installed
inventory:
    ./scripts/inventory.sh

# Behaviour tests in a temporary HOME
test:
    bash tests/run.sh

# Lint the shell scripts this repo owns. git-hooks/commit-msg is vendored
# (git-good-commit) and deliberately excluded. Info-level notes are not fatal.
lint:
    shellcheck --severity=warning install.sh scripts/*.sh git-hooks/pre-push

# Same, but show info-level notes too (does not fail the build)
lint-all:
    -shellcheck install.sh scripts/*.sh git-hooks/pre-push

# Show what install.sh would do, without doing it
plan *ARGS:
    ./install.sh --dry-run {{ARGS}}

# Symlink git-hooks/ into a repository (defaults to the current directory)
hooks TARGET=".":
    ./scripts/install-git-hooks.sh {{TARGET}}

# Scan a repository's full history for secrets (defaults to this one)
scan TARGET=".":
    gitleaks git --no-banner --redact {{TARGET}}

# Report drift between the installed brain scripts and brain-template/
brain-drift:
    ./scripts/sync-brain-template.sh

# Homebrew: what the Brewfile promises vs what is installed
brew-check:
    brew bundle check --verbose --file=Brewfile || true
    @echo "--- outdated: $(brew outdated --quiet | wc -l | tr -d ' ') package(s) ---"
