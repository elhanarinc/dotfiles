#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
"$root/scripts/audit-public.sh"
printf 'PASS audit_public_test\n'
