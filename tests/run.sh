#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")" && pwd)"
for test_file in "$root"/*_test.sh; do bash "$test_file"; done
