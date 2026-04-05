# IRA Hook System

> Lifecycle hooks that enforce behavior the AI cannot forget.

---

## Philosophy

Hooks are the enforcement layer. If something MUST happen, a hook guarantees it. Prompts can be ignored — hooks cannot.

---

## Hook Inventory

| Event | Script | Timeout | Purpose |
|-------|--------|---------|---------|
| SessionStart | `context-loader.mjs` | 5s | Load .ira/ state, TELOS, project memory |
| UserPromptSubmit | `keyword-detector.mjs` | 5s | Keyword detection, complexity classification |
| PreToolUse | `boundary-enforcer.mjs` | 3s | Agent role boundary enforcement |
| PostToolUse | `state-sync.mjs` | 3s | ISC progress sync, learning extraction |
| PreCompact | `context-saver.mjs` | 10s | Save critical state before context compaction |
| Stop | `ralph-loop.mjs` | 10s | Block premature stops if ralph/autopilot active |
| SessionEnd | `session-harvester.mjs` | 30s | Harvest learnings, archive state |

---

## Hook Communication

All hooks:
- **Input:** JSON via stdin (prompt, cwd, sessionId, event-specific fields)
- **Output:** JSON via stdout (`hookSpecificOutput`, `decision`, `reason`)
- **Exit:** Always 0 (graceful failure — never block Claude Code)
- **Timeout:** Specified per hook, fail-open on timeout

### Output Types

**Inject context:**
```json
{
  "hookSpecificOutput": {
    "additionalContext": "[IRA] Ralph active. Loop until ISC verified."
  }
}
```

**Block action:**
```json
{
  "decision": "block",
  "reason": "[RALPH LOOP — Iteration 3/25] Continue working. ISC criteria not yet fully satisfied. Review your progress and continue to the next step."
}
```

**Pass through:**
```json
{}
```

---

## Key Hooks Explained

### keyword-detector.mjs (UserPromptSubmit)

1. Reads user prompt from stdin
2. Sanitizes: strips XML tags, URLs, code blocks
3. Checks informational intent (multi-language: "what is X?" doesn't trigger X)
4. Pattern matches against keyword registry
5. Priority resolution if multiple keywords detected
6. Creates state files for stateful modes (ralph, ultrawork)
7. Classifies complexity (simple/standard/deep/comprehensive)
8. Emits additionalContext with activation instructions

### ralph-loop.mjs (Stop)

1. Reads Stop event from stdin
2. Checks `.ira/state/ralph-state.json`
3. If active, not stale, and iterations < max:
   - Checks `work.json` for ISC completion status
   - If ISC incomplete: emits `{ decision: "block", reason: "..." }` with continuation prompt
   - Increments iteration counter
4. Safety checks:
   - 2-hour staleness → treat as inactive
   - Context limit stop → never block
   - User abort → always respect
   - Max iterations (25) → deactivate and allow stop

### boundary-enforcer.mjs (PreToolUse)

1. Reads tool use event
2. Checks if an agent context is active
3. If agent has `disallowedTools` matching the tool → block
4. Otherwise → pass through

---

## Hook Installation

Hooks are registered in Claude Code's `settings.json`. Use the setup script for fresh installs or uninstall-pai for migrations:

```bash
# Fresh install
bun run scripts/setup.ts

# Migrating from PAI
bun run scripts/uninstall-pai.ts
```

This merges IRA's `hooks/hooks.json` into `~/.claude/settings.json`.

---

## Adding Custom Hooks

1. Create a script in `hooks/scripts/`
2. Add registration to `hooks/hooks.json`
3. Run `bun run scripts/uninstall-pai.ts` to re-register (or manually update `~/.claude/settings.json`)
