#!/usr/bin/env bash
# Phase 6 E2E — core IRA flow in a SANDBOX HOME (never the real ~/.claude).
# Covers: SessionStart context load (detail-survives-/clear), UserPromptSubmit recall +
# learning capture (never-silent), and persistence of the learning artifact.
# Exit 0 = all pass.
set -u
HOOKS="$(cd "$(dirname "$0")/.." && pwd)"            # .../v5/.claude/hooks
SBX="$(mktemp -d)"
export HOME="$SBX/home"
export PAI_DIR="$SBX/home/.claude/PAI"
mkdir -p "$HOME/.claude" "$PAI_DIR/MEMORY/WORK" "$PAI_DIR/MEMORY/LEARNING/SIGNALS" "$SBX/bin"
echo '{"principal":{"name":"Operator","timezone":"America/New_York"}}' > "$HOME/.claude/settings.json"
printf '#!/bin/sh\nexit 1\n' > "$SBX/bin/claude"; chmod +x "$SBX/bin/claude"   # offline learning fallback
export PATH="$SBX/bin:$PATH"

pass=0; fail=0
check() { if eval "$2"; then echo "  PASS: $1"; pass=$((pass+1)); else echo "  FAIL: $1"; fail=$((fail+1)); fi; }

# Seed a prior-work ISA with a planted detail.
SDIR="$PAI_DIR/MEMORY/WORK/20260609-000000_e2e-binding"; mkdir -p "$SDIR"
cat > "$SDIR/ISA.md" <<EOF
---
id: ISA-e2e
title: "E2E binding test"
session_id: e2e-1
status: EXECUTE
verification_summary: "1/3"
---
## DECISIONS
- E2E_TOKEN_42: recall binds to ira-memory :7775 over HTTP
EOF

# 1. SessionStart → LoadContext auto-injects the FULL ISA (detail survives /clear) — ISC-6.2
echo '{}' | timeout 25 bun "$HOOKS/LoadContext.hook.ts" 2>/dev/null > "$SBX/load.out"
check "6.2 detail-survives-/clear (full ISA auto-injected)" "grep -q E2E_TOKEN_42 '$SBX/load.out'"

# 2. UserPromptSubmit → SatisfactionCapture writes a signal even offline — ISC-6.3
RAT="$PAI_DIR/MEMORY/LEARNING/SIGNALS/ratings.jsonl"
echo '{"session_id":"e2e","prompt":"now wire the next component","transcript_path":"/dev/null","hook_event_name":"UserPromptSubmit"}' \
  | timeout 25 bun "$HOOKS/SatisfactionCapture.hook.ts" >/dev/null 2>"$SBX/sc.err"
check "6.3 learning-never-silent (signal written)" "[ -s '$RAT' ]"
check "6.3 no crash under placeholder/offline" "! grep -qE 'RangeError|Fatal error' '$SBX/sc.err'"

# 3. memory/harvest artifact persisted — ISC-6.1
check "6.1 learning artifact persisted (ratings.jsonl)" "[ -f '$RAT' ]"

# 4. UserPromptSubmit → IraRecall executes cleanly (local recall; fail-open) — ISC-6.1 routing
echo '{"prompt":"what binds recall to memory and on what port"}' | timeout 20 bun "$HOOKS/IraRecall.hook.ts" >/dev/null 2>&1
check "6.1 recall hook executes cleanly (exit 0)" "[ $? -eq 0 ]"

rm -rf "$SBX"
echo "  E2E: $pass passed, $fail failed"
[ "$fail" -eq 0 ] && exit 0 || exit 1
