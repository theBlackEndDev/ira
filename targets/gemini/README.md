# GIRA — IRA for Gemini CLI & Antigravity

GIRA is IRA (PAI 5.0) packaged for Google's **Gemini CLI** and **Antigravity CLI**. It is **not
hand-maintained** — it is *generated* from the live `v5/.claude` tree by `build.ts`, so it tracks
IRA instead of drifting out of sync (the failure mode of the original gira).

```bash
bun targets/gemini/build.ts            # regenerate both packages into dist/
#   dist/gira-gemini/      → Gemini CLI extension  (gemini-extension.json, GEMINI.md, commands/)
#   dist/gira-antigravity/ → Antigravity CLI plugin (plugin.json)
```

## Install — choose your harness

```bash
bun targets/gemini/install.ts                        # --target auto (default): install to whatever's detected
bun targets/gemini/install.ts --target gemini        # Gemini CLI extension only  → ~/.gemini/extensions/gira
bun targets/gemini/install.ts --target antigravity   # Antigravity plugin only    → ~/.gemini/antigravity-cli/plugins/gira
bun targets/gemini/install.ts --target both          # both
bun targets/gemini/install.ts --dry-run              # preview, change nothing
```

`auto` detects each CLI by binary-on-PATH (`gemini` / `antigravity`) or its home dir. The installer
**regenerates from v5 first** (skip with `--no-generate`), removes any prior `gira` *and* a stale
`gira.bak` (the leftover-`.bak` dup-load bug from the original build), then copies in the fresh
package. For Antigravity it writes a root `hooks.json` with absolute paths, since Antigravity
doesn't substitute `${extensionPath}` the way Gemini CLI does.

## Staying current

**Full machines** (Claude IRA + memory + GIRA): `bun run update` refreshes GIRA automatically after
the rest — but only if it's already installed, so a Claude-only box is never forced to take it.

**GIRA-only boxes** (e.g. a work machine running Gemini CLI but not the Claude IRA stack): use

```bash
bun run update -- --gira-only      # pull ira + regenerate/reinstall GIRA, nothing else
```

`--gira-only` skips the `~/.claude` install, Pulse, and the ira-memory backend steps entirely —
it just `git pull`s the ira repo and reruns `install.ts --target auto`. Manage ira-memory
separately on those boxes (see the ira-memory repo's update steps). Either way GIRA is regenerated
from the freshly-pulled v5 tree, so it always tracks IRA.

## What the generator does (v5 → Gemini)

- **Agents** (`v5/.claude/agents/*.md` → `agents/*.md`): keeps name/description/body; maps the
  model tier via `model-map.json`; converts `maxTurns`→`max_turns`; turns v5's `disallowedTools`
  *denylist* into Gemini's `tools` *allowlist* (read-only agents → a read-only toolset, others →
  `*`); **drops** Claude-only frontmatter (`voice`/`persona`/`color`/`isolation`/`permissions`)
  that Gemini rejects. Names are lowercased (Gemini invokes by lowercase name).
- **Skills**: a curated subset (`SKILLS` in `build.ts`) — execution/reasoning/research skills that
  are self-contained on a Gemini harness. PAI-infra (Pulse/Daemon/Arbol), vendor/tool-bound
  (Apify/Browser/Remotion/…), and Claude-loop-only skills are excluded. Names that collide with
  Gemini built-ins (`plan`, `review`, …) are namespaced to `gira-*`.
- **GEMINI.md**: IRA's behavioral contract, derived from `v5/.claude/CLAUDE.md` with Claude/PAI-only
  mechanics stripped (Pulse voice curls, PAI/ path reads, Forge tier bindings).
- **Hooks** (`templates/hooks/`): ported to `.mjs` and wired to Gemini's events. Memory recall +
  capture talk to the same ira-memory API (`:7775`) IRA uses on Claude.

## Hook event mapping & the Ralph caveat

| IRA (Claude) | Gemini | Status |
|---|---|---|
| SessionStart | SessionStart | ✅ context/state load |
| UserPromptSubmit | BeforeAgent | ✅ project-scoped recall (`X-Cwd` boost) + keyword/complexity |
| PostToolUse | AfterTool | ✅ ISC tracking |
| PreCompact | PreCompress | ✅ state save |
| SessionEnd | SessionEnd | ✅ conversation capture to `:7775` |
| **Stop** | *(none)* | ❌ **Gemini has no stop-veto hook — the Ralph completion-loop is not enforceable; `ralph` degrades to guidance.** |

## Config

- `model-map.json` — v5 model tier → Gemini model ID (edit as Google ships new models).
- `SKILLS` / `COLLIDING` in `build.ts` — tune the skill subset and namespacing.
- `IRA_MEMORY_URL` (default `http://127.0.0.1:7775`), `IRA_ALLOW_REMOTE_MEMORY=1` to allow a
  non-local backend.

Generated `dist/` is gitignored — it is always reproducible from `bun targets/gemini/build.ts`.
