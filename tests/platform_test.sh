#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/test_helper.sh"

# fake_platform <uname -s> <hw.optional.arm64|missing> <sysctl.proc_translated>
fake_platform() {
  printf '#!/bin/sh\necho %s\n' "$1" > "$TEST_ROOT/bin/uname"
  cat > "$TEST_ROOT/bin/sysctl" <<EOF
#!/bin/sh
case "\$2" in
  hw.optional.arm64) [ "$2" = missing ] && exit 1; echo $2 ;;
  sysctl.proc_translated) echo $3 ;;
  *) exit 1 ;;
esac
EOF
  chmod +x "$TEST_ROOT/bin/uname" "$TEST_ROOT/bin/sysctl"
}
detect() { bash -c 'source "$1/scripts/lib.sh"; detect_os; echo "$OS/$ARCH $HOMEBREW_PREFIX"' _ "$REPO_ROOT" 2>&1; }

fake_platform Darwin 1 0
assert_contains "$(detect)" "macos/arm64 /opt/homebrew"

fake_platform Darwin missing 0
assert_contains "$(detect)" "macos/x86_64 /usr/local"

# Rosetta shell on Apple Silicon: uname would say x86_64, must refuse instead
fake_platform Darwin 1 1
if out="$(detect)"; then fail "detect_os accepted a Rosetta shell: $out"; fi
assert_contains "$out" "Rosetta"

fake_platform Linux missing 0
if out="$(detect)"; then fail "detect_os accepted Linux: $out"; fi
assert_contains "$out" "macOS only"

printf 'PASS platform_test\n'
