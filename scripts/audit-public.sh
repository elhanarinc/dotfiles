#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
failed=0
check() {
  local label="$1" pattern="$2" matches
  matches="$(git grep -nIE "$pattern" -- ':!tests/fixtures/**' ':!scripts/audit-public.sh' ':!docs/**' 2>/dev/null || true)"
  if [[ -n "$matches" ]]; then
    printf '[FAIL] %s\n%s\n' "$label" "$(printf '%s\n' "$matches" | cut -d: -f1-2)" >&2
    failed=1
  fi
}
check 'hard-coded macOS user path' '/Users/[A-Za-z0-9._-]+'
check 'private key material' 'BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY'
check 'credential assignment' '(api[_-]?key|access[_-]?token|client[_-]?secret|password)[[:space:]]*[:=][[:space:]]*"[A-Za-z0-9]'
check 'company-specific content' '(appsamurai|storyly|netvent)'
if [[ $failed -ne 0 ]]; then exit 1; fi
printf '[OK] tracked files passed public-safety audit\n'
