# Codex Hook Schema (empirically captured)

Captured 2026-04-24 against `codex 0.125.0` (gpt-5.5). Source-of-truth for Phase 1+ work.

## Native event taxonomy

Six events are dispatchable per `HookEventNameWire` enum in the codex binary:

| Event | Fires on |
|---|---|
| `SessionStart` | session boot |
| `UserPromptSubmit` | every user prompt |
| `PreToolUse` | before any tool call (incl. Bash) |
| `PostToolUse` | after a tool call |
| `PermissionRequest` | when a tool needs approval (only fires when `permission_mode != bypassPermissions`) |
| `Stop` | model done speaking; blocking re-prompts the model |

**No `PreCompact`.** **No `SessionEnd`.** SessionEnd is substituted by `Stop` with `stop_hook_active=false` (verified — see Stop blocking section).

## Stdin envelope (snake_case across the wire)

Every event includes:
```json
{
  "session_id": "019dc24d-...",
  "transcript_path": "/home/hus/.codex/sessions/2026/04/24/rollout-...jsonl",
  "cwd": "/home/hus/golden-claw-workspace/ira",
  "hook_event_name": "<event>",
  "model": "gpt-5.5",
  "permission_mode": "bypassPermissions"
}
```

Plus per-event additions:

| Event | Adds |
|---|---|
| SessionStart | `source: "startup" \| "resume" \| "clear"` (only `startup` observed) |
| UserPromptSubmit | `turn_id`, `prompt` |
| PreToolUse | `turn_id`, `tool_name` (e.g. `"Bash"`), `tool_input` (object), `tool_use_id` |
| PostToolUse | `turn_id`, `tool_name`, `tool_input`, `tool_response` (string), `tool_use_id` |
| PermissionRequest | `turn_id`, `tool_name`, `tool_input`, `tool_use_id` (untested — needs non-trusted project) |
| Stop | `turn_id`, `stop_hook_active` (bool), `last_assistant_message` |

## Field-name map vs Claude Code

| Claude (camelCase) | Codex (snake_case) |
|---|---|
| `sessionId` | `session_id` |
| `toolName` | `tool_name` |
| `toolInput` | `tool_input` |
| `toolOutput` | `tool_response` ← also a different word |
| `stopReason` | `stop_hook_active` + `last_assistant_message` ← different shape |
| `cwd` | `cwd` (same) |
| `prompt` | `prompt` (same) |
| (none) | `transcript_path`, `model`, `permission_mode`, `tool_use_id`, `turn_id` (Codex-only) |

5 of the 8 IRA hook scripts read fields that change name on Codex: `keyword-detector.mjs`, `boundary-enforcer.mjs`, `state-sync.mjs`, `ralph-loop.mjs`, `session-harvester.mjs`. The normalizer (Phase 2 D3) maps Codex → Claude shape so hook script bodies stay unchanged.

## Output envelope (JSON to stdout, exit 0)

Common output keys (all events):
```ts
{
  continue?: boolean,           // default true. false = stop dispatch chain
  decision?: "block" | null,    // BlockDecisionWire — re-prompts model on Stop, blocks tool on PreToolUse
  reason?: string,              // shown to user when decision="block"
  stopReason?: string,          // separate from `reason`
  suppressOutput?: boolean,     // default false
  systemMessage?: string,       // injected as system msg
  hookSpecificOutput?: { ... }  // see per-event below
}
```

**PreToolUse** `hookSpecificOutput`:
```ts
{
  hookEventName: "PreToolUse",                      // required
  additionalContext?: string,
  permissionDecision?: "allow"|"deny"|"ask"|null,
  permissionDecisionReason?: string,
  updatedInput?: unknown                             // can mutate tool_input
}
```

**PostToolUse** `hookSpecificOutput`: `{hookEventName, additionalContext?, updatedMCPToolOutput?}`

**PermissionRequest** `hookSpecificOutput`: `{hookEventName, decision: "allow"|"deny"|"ask"|null}`

**SessionStart, UserPromptSubmit, Stop** `hookSpecificOutput`: `{hookEventName, additionalContext?}` (inferred — schemas truncated in binary string extract)

Returning bare `{}` works (verified) — Codex treats it as "continue, no decision."

## Stop blocking — Ralph viability

**Confirmed working.** Empirical test (`stop-block-test.mjs`, 2026-04-24):

```
2026-04-25T01:43:39.105Z stop fired count=0 stop_hook_active=false
2026-04-25T01:43:46.792Z stop fired count=1 stop_hook_active=true
2026-04-25T01:43:50.142Z stop fired count=2 stop_hook_active=true
```

- First Stop: `stop_hook_active=false` — real session-end signal
- Subsequent Stops triggered by the previous block: `stop_hook_active=true`
- Codex prints `hook: Stop Blocked` to TUI and re-prompts the model
- Model's response when prompted again with no new user input: "No active task remains to continue." — so Ralph hooks must inject a `reason` or `systemMessage` that gives the model concrete next-action guidance, not just `"continue"`.

**SessionEnd substitute:** check `stop_hook_active === false` inside the Stop handler. That's the real final stop. `session-harvester.mjs` runs only on that branch.

## Codex hooks.json format

Identical to Claude's `~/.claude/settings.json` `hooks` shape. Top-level `{hooks: {<EventName>: [{matcher?, hooks: [{type, command}]}]}}`.

Confirmed example from `~/.codex/.tmp/plugins/plugins/figma/hooks.json`:
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [{"type": "command", "command": "./scripts/post.sh"}]
      }
    ]
  }
}
```

`matcher` is optional and matches against `tool_name`. Codex looks at `~/.codex/hooks.json` (verified by direct test).

## Feature gate

`codex_hooks` is in `codex features list` as **stable + true by default**. No need to set `[features].codex_hooks=true` in config.toml on current Codex versions; it's safe to set anyway for forward-compat.

## What this resolves vs the original critic concerns

| Concern | Resolution |
|---|---|
| Hook stdin schema undocumented | Captured. See above. |
| Field naming snake_case vs camelCase | Confirmed snake_case wire fields. Mapping table above. |
| SessionEnd absence breaks session-harvester | Substitute: Stop event with `stop_hook_active=false`. |
| Stop blocking semantics unknown — Ralph blocker | Confirmed: `decision:"block"` re-prompts model. `stop_hook_active` flag distinguishes real-stop from Ralph-induced re-fire. |
| 6th event PermissionRequest | New surface; not load-bearing for IRA but safe to register. |
| PreCompact absence | Still gone. Skip on Codex (architect's call stands). |
