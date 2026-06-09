#!/usr/bin/env bash
# ISC-6.4: the platform adapter must render the correct service unit for BOTH OSes,
# regardless of host — proves cross-platform support without needing a Mac in CI.
set -u
HOOKS="$(cd "$(dirname "$0")/.." && pwd)"
out="$(bun "$HOOKS/lib/platform.ts" 2>&1)"
pass=0; fail=0
check() { if echo "$out" | grep -q "$2"; then echo "  PASS: $1"; pass=$((pass+1)); else echo "  FAIL: $1"; fail=$((fail+1)); fi; }
check "darwin → launchd plist" "darwin → launchd"
check "linux → systemd user unit" "linux → systemd"
check "systemd carries enable-linger note" "enable-linger"
echo "  platform: $pass passed, $fail failed"
[ "$fail" -eq 0 ] && exit 0 || exit 1
