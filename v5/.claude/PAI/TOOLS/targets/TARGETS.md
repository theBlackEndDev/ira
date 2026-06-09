# Target Adapter Seam

IRA runs a whole interactive **session** on one **CLI target** behind a small adapter interface,
so new agent CLIs can be added without touching hooks, skills, or the CLI. Today there is exactly
one active session target — **Claude Code**. Codex has been removed **only as a session target**
(the `--target codex` wrapper). **Gemini Antigravity 2.0** is the planned next session target and
attaches here (post-completion task).

> Note: this is about the *session* target only. PAI's cross-vendor codex **sub-agents** — `Forge`
> (GPT‑5.4 code producer via `codex exec`), `CrossVendorAudit`, `CodexResearcher` — are unrelated to
> this seam and are **retained**. They are normal `Agent(subagent_type=…)` calls, not a session target.

## Interface (`types.ts`)
A `TargetAdapter` describes how IRA invokes and configures one agent CLI:
- `name` — `"claude"` (future: `"antigravity"`)
- `detect()` — is the binary on PATH?
- `launchCommand(opts)` — how a tmux pane / session starts this CLI
- `promptFlag` — how a one-shot prompt is passed (`--prompt` for Claude)
- hook/config wiring — where this target expects hooks + settings

## Active target
- `claude.ts` — Claude Code adapter. Hooks live in `~/.claude/settings.json`; identity via
  `CLAUDE.md` + `PAI/USER/*`. Model tiers resolve through `model-map.json` (`{tier: {claude}}`).

## Adding Gemini Antigravity 2.0 (stub)
1. Add `antigravity.ts` implementing `TargetAdapter` (`name: "antigravity"`, `detect()` probing
   the `antigravity` binary, `launchCommand`/`promptFlag` for its invocation).
2. Extend `model-map.json` tiers with an `"antigravity"` model per tier; flip
   `_targets.active` to include `"antigravity"`.
3. Register it in `Cli/ira-cli.ts` target validation (replace the Claude-only guard with a
   set membership check) and in `binaryCmd` (the per-pane command builder already has the
   documented attach point).
4. No hook changes required — hooks are target-agnostic (they read stdin JSON + filesystem state).

## Why Codex was removed as a SESSION target
PAI 5.0 is Claude-native (Bun, `--append-system-prompt-file`, MCP). Maintaining the old dual-target
normalization seam (`normalize.mjs` + `codex.ts`) — which ran an entire IRA session inside the codex
CLI — was net-negative; running whole sessions in codex was redundant. The session-target seam itself
is preserved (this file + `types.ts`) so the *next* target (Antigravity) is a clean add.

This does NOT remove codex from IRA: the operator has codex installed, and PAI's cross-vendor codex
**sub-agents** (Forge et al.) continue to call `codex exec` for slices of work within a Claude session.
