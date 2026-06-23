# IRA -- Intelligent Reasoning Assistant

> A personal AI operating system for Claude Code, built on PAI 5.0. Structured quality assurance meets autonomous execution, with persistent cross-session memory.

IRA runs on the **PAI 5.0** architecture (Algorithm + ISA quality system, Pulse dashboard, composable skills and agents) wired to a local **pgvector-backed memory** so context follows you across sessions, surfaces, and machines.

The repository is two cooperating pieces:

| Piece | What it is | Lives at |
|-------|-----------|----------|
| **`ira`** (this repo) | The PAI 5.0 `.claude` tree, the installer, and the updater. The installer lays `v5/.claude` into your `~/.claude`. | `v5/.claude/` |
| **`ira-memory`** | The memory backend — a Bun HTTP API on `:7775` over Postgres + pgvector. Stores long-term memory, entities, KV, and conversation logs. | separate repo (`theBlackEndDev/ira-memory`) |

> The repo root also still contains the **pre-v5 IRA** (`agents/`, `skills/`, `hooks/scripts/*.mjs`, `bun run setup`). That generation has been superseded by the v5 tree and is retained only for migration reference — see [Migrating from pre-v5](#migrating-from-pre-v5).

---

## What IRA Does

- **PAI 5.0 substrate** -- the Algorithm (Current State → Ideal State via verifiable ISC), self-activating skills, named agents with distinct voices, and a SessionStart→SessionEnd hook lifecycle.
- **Persistent memory** -- everything you do is captured on SessionEnd into both the pgvector store (`:7775`) and full-detail WORK ISAs, so the next session *knows the details* without you re-explaining.
- **Project-scoped recall** -- recall is biased toward the repo you're in (cwd-derived), so a dense project's memory never drowns the one you're actually working on.
- **One-command install and update** -- cross-platform (macOS + Linux); brings up the backend, installs managed services, and reinstalls the tree.
- **Self-healing services** -- Pulse and the memory API run as launchd (macOS) / systemd-user (Linux) units that restart on failure and survive reboot.
- **Pulse dashboard** -- a local Life/Observability dashboard at `http://localhost:31337`.

---

## Prerequisites

- [Bun](https://bun.sh/) runtime (`~/.bun/bin` on PATH)
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI
- **Docker** -- runs the `ira-memory` Postgres + pgvector container (memory backend)
- **gitleaks** -- only needed if you seed historical transcripts (`--seed`); the seed step is gitleaks-gated and refuses to run without it

---

## Quick Start

### 1. Memory backend (`ira-memory`)

```bash
git clone git@github.com:theBlackEndDev/ira-memory.git ~/Projects/ira-memory
cd ~/Projects/ira-memory
cp .env.example .env          # set MEMORY_DATABASE_URL (defaults to localhost:5433) + OPENAI_API_KEY
docker compose up -d          # Postgres + pgvector
bun install
bunx prisma migrate deploy    # apply schema
```

### 2. IRA tree (`ira`)

```bash
git clone git@github.com:theBlackEndDev/ira.git ~/Projects/ira
cd ~/Projects/ira

# Lays v5/.claude into ~/.claude, fills timezone, starts Pulse + memory-api services.
# Your existing settings keys (env, permissions, mcpServers, model, principal) are preserved.
bun v5/.claude/PAI/TOOLS/Install/install.ts --home ~ --start-daemons
```

Installer flags: `--home <dir>` (target, defaults to `$HOME`), `--start-daemons` (install + start Pulse), `--seed` (import historical transcripts — gitleaks-gated), `--dry-run`, `--timezone <IANA>`.

> The installer is **idempotent** and **settings-safe**: it backs up nothing destructively, replaces top-level symlinks with real files, prunes stale nested skill symlinks, and deep-merges your preserved settings keys back in.

### 3. Verify

```bash
curl -s http://127.0.0.1:7775/health           # {"status":"ok","backend":"ira-memory","port":7775}
open http://localhost:31337                      # Pulse / PAI Observatory dashboard
```

---

## Keeping Current

`bun run update` is the one command to bring a machine up to date — it pulls both repos, updates the backend, reinstalls the tree, and restarts services.

```bash
cd ~/Projects/ira
bun run update                 # full update
bun run update:dry-run         # preview every action, change nothing
```

What it does, in order:
1. **Backs up** `~/.claude` (excludes the large `projects/` corpus) — skip with `--no-backup`.
2. **Fast-forward pulls** `ira` and `ira-memory` (stops on dirty tracked files unless `--force`, which autostashes).
3. **Updates the backend** — `bun install`, brings up the DB (`docker compose up -d`), and runs `prisma migrate deploy` (retries while the DB warms).
4. **Installs/refreshes the managed `ira-memory-api` service** (systemd/launchd) and restarts it.
5. **Reruns the IRA installer** (`--start-daemons`), restarting Pulse.
6. **Health-checks** `:7775` and `:31337`.

Flags: `--dry-run`, `--no-backup`, `--seed`, `--force`. If your repos live outside the default paths, set `IRA_MEMORY_REPO` (or `IRA_MEMORY_PROJECT`) — the `ira` repo is auto-located from the script's own path.

> **Multi-machine note:** memory is per-machine by default (each box has its own Postgres). To share one memory across machines, point every machine's `IRA_MEMORY_URL` at a single backend instead of standing up a local one.

---

## Services

The installer/updater manage two long-running user services. Both restart on failure and survive reboot (Linux needs `loginctl enable-linger $USER` once on headless boxes).

| Service | Port | What | Unit |
|---------|------|------|------|
| **ira-pulse** | 31337 | Pulse — Life/Observability dashboard (`PAI Observatory`) | launchd `com.ira.ira-pulse` / systemd `ira-pulse` |
| **ira-memory-api** | 7775 | Memory HTTP API over Postgres + pgvector | launchd `com.ira.ira-memory-api` / systemd `ira-memory-api` |

The service env carries an explicit `PATH` (bun bin + Homebrew + standard dirs) so Pulse's cron jobs resolve `bun`/`git`/`docker` even under launchd/systemd's minimal environment.

---

## Memory & Recall

Memory is the core of IRA. Two write paths fire on **SessionEnd** (the `SessionCapture` hook), so work done in a session is never lost after `/clear`:

1. **Conversation → `:7775`** via `ira-memory`'s `cc-capture` — powers `/conversation/recent`, search, and the resume-session skill.
2. **Transcript → WORK ISA** via the gitleaks-gated seeder — preserves the session's user/assistant turns verbatim (not a lossy summary), so SessionStart can auto-inject the full active ISA.

On **UserPromptSubmit**, the `IraRecall` hook does project-scoped semantic recall:

- It passes your **cwd** to the server, which derives the current project and **boosts** same-project facts (a soft additive boost — other projects still surface, so a sparse/new project never returns an empty recall).
- Project slugs are derived from both `~/Projects/<slug>/` and `/orchestrator/projects/<slug>/` layouts.
- **Explicit** scoping (`?project=` / `X-Project`, used by resume-session) is a *hard* filter; **cwd-derived** scoping is a *soft* boost. Clean intent split.

To tag a machine's historical facts so the boost has data to lift, run once:

```bash
cd ~/Projects/ira-memory
bun run src/backfill-project-tags.ts --dry-run    # preview groups + counts
bun run src/backfill-project-tags.ts              # apply (idempotent)
```

Only sessions that recorded a cwd are taggable; everything captured going forward tags automatically.

---

## Memory & Conversation API (`:7775`)

A persistent HTTP API runs on `http://127.0.0.1:7775`, backed by ira-memory (Postgres + pgvector). Every channel (Discord, Telegram, CLI, webchat) reads and writes through the same endpoints.

**Long-term memory** -- typed (`user` / `feedback` / `project` / `reference`), semantic recall via pgvector:

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/memory` | Store `{name, type, content, description}` |
| GET | `/memory/recall?topic=...` | Semantic + structured recall (accepts `?project=` or `X-Cwd` for scoping) |
| GET | `/memory/search?q=...` | Full-text search |
| GET | `/memory/list?limit=50` | List recent memories |
| DELETE | `/memory/<id>` | Archive |

**Entities & key-value:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/entity` | Store an entity (person, project, place) |
| GET | `/entity/search?q=...` | Search entities |
| GET / PUT / DELETE | `/kv/<key>` | Scratch state for cron, last-run timestamps, flags |

**Conversation logging** -- every user message and assistant response on a channel should be logged:

```bash
curl -s -X POST http://127.0.0.1:7775/conversation/log \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg role "user" --arg content "msg" --arg channel "discord" \
    '{role:$role, content:$content, channel:$channel}')"
```

Retrieval: `GET /conversation/recent?limit=20&channel=discord` (also accepts `project=<slug>`) and `GET /conversation/search?q=...`. Messages group into per-channel sessions automatically and embed async into pgvector for later semantic recall.

Health: `GET /health` -> `{"status":"ok","backend":"ira-memory","port":7775}`.

---

## Agents

18 PAI agents, including cross-vendor code producers and a research fleet. A few key ones:

| Agent | Role |
|-------|------|
| Engineer | Claude-family principal engineer — TDD, implementation |
| Forge | OpenAI-family (GPT-5.4 via `codex exec`) — code quality + completeness |
| Anvil | Moonshot-family (Kimi K2.6) — long-context, whole-project code generation |
| Architect | System design, specs, implementation plans |
| Cato | Cross-vendor ISA auditor (read-only, end of VERIFY on deep work) |
| Designer | UX/UI implementation |
| Silas | Offensive-security specialist (parallel sub-assessments) |
| Algorithm | ISC creation/evolution across Algorithm phases |
| Researchers | Claude / Gemini / Grok / Perplexity / Codex research fleet |

Full definitions live in `v5/.claude/agents/*.md`.

---

## Skills

59 self-activating skills span execution, research, content, security, media, and meta-tooling — composed as needed by the Algorithm. Highlights:

- **Execution / quality:** `build`, `plan`, `analyze`, `review`, `verify`, `ralph`, `autopilot`, `anti-slop`, `ISA`, `Delegation`
- **Reasoning:** `Council`, `RedTeam`, `FirstPrinciples`, `SystemsThinking`, `BeCreative`, `Ideate`, `ApertureOscillation`
- **Research / knowledge:** `Research`, `ArXiv`, `ExtractWisdom`, `Knowledge`, `Fabric`, `ContextSearch`
- **Web / browser:** `Interceptor` (verification), `Browser`, `BrightData`, `Apify`, `playwriter`
- **Media:** `Art`, `Remotion`, `AudioEditor`
- **Meta:** `CreateSkill`, `CreateCLI`, `Agents`, `PAIUpgrade`, `BitterPillEngineering`

Browse `v5/.claude/skills/`. Each skill is a `SKILL.md` with optional `Workflows/`, `Tools/`, and reference files.

---

## Other harnesses — GIRA (Gemini CLI & Antigravity)

IRA runs natively on Claude Code. To run it on **Gemini CLI** or Google's **Antigravity CLI**,
there's **GIRA** — IRA packaged for those harnesses, *generated* from the live `v5/.claude` tree
(so it tracks IRA instead of drifting):

```bash
bun targets/gemini/build.ts                    # generate the packages from v5
bun targets/gemini/install.ts --target auto    # install to detected CLIs (gemini | antigravity | both | auto)
```

`bun run update` refreshes GIRA automatically on machines that have it. The generator transforms
v5 agents/skills into Gemini-compatible form and wires memory recall + capture to the same
ira-memory backend (`:7775`). One caveat: Gemini CLI has no stop-veto hook, so the Ralph
completion-loop degrades to guidance there (everything else is at parity). See
[`targets/gemini/README.md`](targets/gemini/README.md).

## CLI + tmux Sessions

IRA includes a CLI (`scripts/ira-cli.ts`) for persistent per-project Claude Code sessions that survive disconnects and reboots.

```bash
# Add the alias (or run via `bun run cli -- <cmd>`)
alias ira='bun run --cwd ~/Projects/ira cli --'

ira tmux start [name] [--cwd path]   # create + attach a session
ira tmux attach [name]               # reattach after disconnect
ira tmux list                        # list sessions with status
ira tmux kill [name]                 # stop a session
ira team N:agent "prompt"            # N parallel Claude panes with an agent role
ira status                           # modes, ISC progress, sessions
```

`Ctrl+B, D` detaches without killing the session. Requires `tmux`.

---

## Migrating from pre-v5

The repo root still carries the previous-generation IRA (root `setup.ts`, `.mjs` hooks, 23-agent / 17-skill layout, Codex dual-target). It is superseded by the v5 install above. The legacy scripts remain available for one-time migration:

```bash
bun run uninstall-pai            # back up + remove a prior PAI/old-IRA install
bun run uninstall-pai:dry-run    # preview
bun run uninstall-pai:restore    # restore from backup
bun run migrate -- --source ~/.claude   # migrate old learnings/memory/PRDs
```

New machines should install the v5 tree directly and skip these.

---

## npm Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `update` | `bun run update` | Pull both repos, update backend, reinstall, restart services |
| `update:dry-run` | `bun run update:dry-run` | Preview the update, change nothing |
| `cli` | `bun run cli -- <cmd>` | CLI (tmux, team, status) |
| `test` | `bun test` | Run tests |
| `test:hooks` | `bun test hooks/` | Hook tests |
| `lint` | `bunx tsc --noEmit` | TypeScript type check |
| `setup` | `bun run setup` | *(legacy)* pre-v5 root install |
| `migrate` | `bun run migrate -- --source <path>` | *(legacy)* migrate pre-v5 data |
| `uninstall-pai` | `bun run uninstall-pai` | *(legacy)* remove a prior PAI/old-IRA install |

Direct entry points (not npm scripts):

```bash
bun v5/.claude/PAI/TOOLS/Install/install.ts --home ~ --start-daemons   # install / cut over
bun ~/Projects/ira-memory/src/backfill-project-tags.ts                 # tag historical memory by project
```

---

## Project Structure

```
ira/
+-- v5/                         # the live system (PAI 5.0)
|   +-- .claude/
|   |   +-- CLAUDE.md           # system prompt
|   |   +-- settings.json       # hook + service wiring
|   |   +-- agents/             # 18 PAI agents
|   |   +-- skills/             # 59 skills (SKILL.md + Workflows/Tools)
|   |   +-- hooks/              # lifecycle hooks (LoadContext, IraRecall, SessionCapture, ...)
|   |   |   +-- lib/            # platform adapter, ira-memory client, normalize
|   |   |   +-- tests/          # E2E + platform + wiring assertions
|   |   +-- PAI/
|   |       +-- TOOLS/Install/install.ts   # the installer
|   |       +-- TOOLS/Seed/                # gitleaks-gated transcript seeder
|   |       +-- PULSE/          # Pulse daemon (dashboard :31337)
|   |       +-- MEMORY/WORK/    # per-session WORK ISAs (full-detail capture)
|   +-- CUTOVER.md              # cutover + rollback runbook
|   +-- PROVENANCE.txt          # upstream PAI SHA this tree derives from
+-- scripts/
|   +-- update.ts               # cross-platform updater (bun run update)
|   +-- ira-cli.ts              # tmux/team/status CLI
|   +-- setup.ts / migrate-from-pai.ts / uninstall-pai.ts   # legacy (pre-v5)
+-- agents/  skills/  hooks/    # legacy pre-v5 IRA (retained for migration)
+-- docs/                       # extended docs
+-- package.json
```

---

## Credits

IRA is built on **[PAI](https://github.com/danielmiessler/Personal_AI_Infrastructure)** by Daniel Miessler — the Algorithm, ISC quality system, skills/agents architecture, Pulse, and TELOS life context. Earlier generations also drew on **[oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode)** by Yeachan Heo (Ralph stop-hook persistence, three-layer skill composition, keyword detection).

---

## License

MIT
