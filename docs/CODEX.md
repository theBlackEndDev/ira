# IRA on Codex CLI

> Running IRA's hook system, skills, and quality loop on OpenAI Codex CLI.

IRA supports Codex CLI 0.125+ as a first-class target alongside Claude Code. The same hooks, skills, Ralph loop, and memory API work on both — with a small set of known degradations documented below.

---

## Quick Start

```bash
bun run setup -- --target codex     # Codex only
bun run setup -- --target both      # both CLIs
bun run setup -- --target auto      # auto-detect what's installed
```

**What gets installed:**

| Path | What it is |
|------|-----------|
| `~/.codex/skills/` | Symlinks to each `skills/<name>/` directory |
| `~/.codex/AGENTS.md` | Symlink to `CLAUDE.md` (shared system prompt source) |
| `~/.codex/hooks.json` | IRA hook registrations for Codex |
| `~/.codex/config.toml` | `[features].codex_hooks=true` written for forward-compat |

The `codex_hooks` feature is stable and enabled by default in Codex 0.125+; the `config.toml` write is a forward-compatibility measure.

---

## Compatibility Matrix

| Feature | Claude Code | Codex CLI | Notes |
|---------|-------------|-----------|-------|
| Hook: SessionStart | ✅ | ✅ | Fires on session boot |
| Hook: UserPromptSubmit | ✅ | ✅ | Fires on every user prompt |
| Hook: PreToolUse | ✅ | ✅ | Fires before any tool call |
| Hook: PostToolUse | ✅ | ✅ (Bash only) | On Codex, only Bash tool reliably triggers PostToolUse; non-Bash tools won't fire ISC sync |
| Hook: PreCompact | ✅ | ❌ | No Codex equivalent; `context-saver.mjs` is skipped on Codex |
| Hook: Stop | ✅ | ✅ | Stop blocking confirmed empirically (see Ralph section) |
| Hook: SessionEnd | ✅ | ➖ | Codex has no SessionEnd event; substituted by `Stop` with `stop_hook_active=false` |
| Hook: PermissionRequest | ❌ | ✅ | Fires when `permission_mode != bypassPermissions`; not yet wired in IRA (v2) |
| Ralph loop (Stop blocking) | ✅ | ✅ | Confirmed: `decision:"block"` re-prompts model; `stop_hook_active` flag distinguishes real-stop from Ralph-induced re-fire |
| ISC sync on Write/Edit | ✅ | ➖ | PostToolUse fires for Bash on Codex; Write/Edit tool calls won't trigger ISC progress tracking |
| Agent tool dispatch | ✅ | ❌ | Codex has no native subagent primitive; agents become inline role hints injected via `systemMessage` |
| Boundary enforcement (`disallowedTools`) | ✅ | ➖ | Only enforced for Bash via PreToolUse on Codex; no enforcement for other tools |
| Memory HTTP API (:7775) | ✅ | ✅ | Target-agnostic; hooks call the same endpoints regardless of CLI |
| Skills | ✅ | ✅ | Identical SKILL.md format; installed to `~/.codex/skills/` vs `~/.claude/skills/` |
| Project context file | `CLAUDE.md` | `AGENTS.md` | Symlinked to the same source file |
| Tier-based model routing | ✅ | ✅ | Resolved via `model-map.json`; see Model Tiers below |

---

## Field-Naming Differences (for Hook Authors)

Codex sends hook payloads in snake_case; Claude Code uses camelCase. The `hooks/scripts/lib/normalize.mjs` utility remaps Codex wire fields to the Claude shape before hook scripts execute — most hook authors never encounter the raw Codex form.

| Claude Code (camelCase) | Codex (snake_case) | Notes |
|-------------------------|--------------------|-------|
| `sessionId` | `session_id` | |
| `toolName` | `tool_name` | |
| `toolInput` | `tool_input` | |
| `toolOutput` | `tool_response` | Different key name, not just case |
| `stopReason` | `stop_hook_active` + `last_assistant_message` | Different shape entirely |
| `cwd` | `cwd` | Same |
| `prompt` | `prompt` | Same |
| (none) | `transcript_path`, `model`, `permission_mode`, `tool_use_id`, `turn_id` | Codex-only fields; available after normalization |

The five IRA hook scripts that read renamed fields (`keyword-detector.mjs`, `boundary-enforcer.mjs`, `state-sync.mjs`, `ralph-loop.mjs`, `session-harvester.mjs`) operate on the normalized Claude-shape payload and do not need Codex-specific branches.

See [`codex-hook-schema.md`](./codex-hook-schema.md) for the canonical field map with empirical verification notes.

---

## Model Tiers on Codex

IRA's three-tier model routing maps to Codex models via `model-map.json`:

| Tier | Purpose | Claude Code model | Codex model |
|------|---------|-------------------|-------------|
| 1 — fast/cheap | scout, formatter, explorer | `claude-haiku-*` | `gpt-5.3-codex` |
| 2 — balanced | executor, debugger, and most Sonnet-tier agents | `claude-sonnet-*` | `gpt-5.5` |
| 3 — max | architect, analyst, critic, and Opus-tier agents | `claude-opus-*` | `gpt-5.5` |

Codex does not yet have an opus-class model; tier 3 maps to `gpt-5.5` (same as tier 2) until one is available.

**Overriding per-machine:** edit `model-map.json` directly. The `model:` field in an agent's frontmatter takes precedence over the tier map and always wins:

```yaml
---
name: my-agent
model: o4-mini     # overrides tier routing entirely
tier: 2
---
```

---

## Caveats

**PermissionRequest events.** The recommended Codex project setup uses `permission_mode: "bypassPermissions"`, which suppresses `PermissionRequest` events. If you configure a project as untrusted (interactive approvals), Codex fires `PermissionRequest` before each tool call. IRA does not yet handle these — they pass through unblocked (v2).

**config.toml comment preservation.** IRA's setup writes `[features].codex_hooks=true` to `~/.codex/config.toml` using `@iarna/toml`. That library does not preserve comments on round-trip. If your `config.toml` contains comments, setup will warn you. Re-add comments manually after running setup.

**Ralph `reason` field on Codex.** When the Stop hook blocks with `decision:"block"`, Codex re-prompts the model using the existing conversation plus the block's `reason` string. If `reason` is too vague ("continue"), the model responds "No active task remains." The default Ralph `reason` already includes concrete next-action guidance; custom Stop hooks should follow the same pattern.

**SessionEnd substitute.** There is no `SessionEnd` event on Codex. `session-harvester.mjs` runs on the `Stop` event branch where `stop_hook_active === false` — that's the real final stop signal. A Ralph-induced Stop re-fire always has `stop_hook_active === true` and is skipped by the harvester.

---

## Acknowledgments

The Codex hook integration was informed by **[oh-my-codex](https://github.com/Yeachan-Heo/oh-my-codex)** by Yeachan Heo, the Codex equivalent of oh-my-claudecode. The hook schema documented here was captured empirically against Codex 0.125.0; oh-my-codex worked out many of the same patterns independently and served as a useful sanity check.
