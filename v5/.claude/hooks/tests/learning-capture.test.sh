#!/usr/bin/env bash
# Regression: PAI/IRA learning capture must NEVER go silent (ISC-2.5).
# A neutral, unrated prompt — with the timezone placeholder bug present AND no working model —
# must still append a signal row to ratings.jsonl. Guards both the Phase-0 fix and the
# timezone defensive fallback. Exit 0 = pass, 1 = fail.
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"            # .../v5/.claude/hooks
HOOK="$HERE/SatisfactionCapture.hook.ts"
SBX="$(mktemp -d)"
export PAI_DIR="$SBX/PAI"
export HOME="$SBX/home"
mkdir -p "$PAI_DIR/MEMORY/LEARNING/SIGNALS" "$HOME/.claude" "$SBX/bin"
# reproduce the bug condition: unfilled placeholder timezone
echo '{"principal":{"name":"Operator","timezone":"{YOUR_TIMEZONE}"}}' > "$HOME/.claude/settings.json"
# dead model: stub `claude` to fail so the implicit-inference path falls back deterministically
printf '#!/bin/sh\nexit 1\n' > "$SBX/bin/claude"; chmod +x "$SBX/bin/claude"
RAT="$PAI_DIR/MEMORY/LEARNING/SIGNALS/ratings.jsonl"

echo '{"session_id":"reg","prompt":"now add a --json flag to the exporter","transcript_path":"/dev/null","hook_event_name":"UserPromptSubmit"}' \
  | PATH="$SBX/bin:$PATH" timeout 25 bun "$HOOK" >/dev/null 2>"$SBX/err"

rows=$(wc -l < "$RAT" 2>/dev/null || echo 0)
crash=$(grep -c -E 'RangeError|Fatal error' "$SBX/err" 2>/dev/null || echo 0)
rm -rf "$SBX"

if [ "$rows" -ge 1 ] && [ "$crash" -eq 0 ]; then
  echo "PASS: learning signal written ($rows row), no crash"
  exit 0
else
  echo "FAIL: rows=$rows crash=$crash"
  exit 1
fi
