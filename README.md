# IRA -- Intelligent Reasoning Assistant

> AI orchestration for Claude Code. Structured quality assurance meets autonomous execution.

IRA combines the best of [PAI](https://github.com/danielmiessler/Personal_AI_Infrastructure) and [oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode) into something leaner and more powerful than either.

---

## What IRA Does

- **Zero ceremony for simple tasks** -- No mode selection. Just work.
- **Full rigor for complex tasks** -- Automatic complexity classification scales ISC criteria, reviewer separation, and verification loops.
- **19 specialized agents** with static model routing (Haiku / Sonnet / Opus)
- **13 composable skills** in three layers (Guarantee + Enhancement + Execution)
- **Ralph loop** -- Stop-hook blocks completion until ISC criteria are verified done
- **Autopilot pipeline** -- Analyze -> Plan -> Build -> QA -> Verify, fully automated
- **ISC quality system** -- Atomic, binary-testable Ideal State Criteria
- **Learning loop** -- Ratings, reflections, and failure analysis feed back into future sessions
- **tmux sessions** -- Persistent per-project Claude Code sessions that survive disconnects
- **TELOS integration** -- Life-aware context for goal-aligned decisions

---

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) runtime
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI installed
- tmux (optional, for session persistence)

### Fresh Install

```bash
git clone <repo-url> ~/ira
cd ~/ira && bun install

# Setup: creates .ira/ dirs, registers hooks, symlinks CLAUDE.md, generates config
bun run setup
```

### Migrating from PAI

```bash
# Switch from PAI to IRA (backs up PAI first)
bun run uninstall-pai

# Migrate PAI data (learnings, memory, PRDs)
bun run migrate -- --source ~/.claude

# Harvest from remote machines
bun run migrate -- --source user@server:~/.claude --harvest-only

# Merge learnings from multiple machines
bun run migrate -- \
  --source user@server1:~/.claude \
  --source user@server2:~/.claude \
  --merge-learnings
```

See [Migration Guide](docs/MIGRATION.md) for details.

---

## Architecture

```
User Input
    |
    v
+-----------------------------------------------+
|  HOOKS (enforcement layer -- 7 lifecycle hooks)|
|  SessionStart  -> context, TELOS, memory, user |
|  UserPromptSubmit -> keywords, complexity      |
|  PreToolUse    -> agent boundary enforcement   |
|  PostToolUse   -> ISC sync, agent tracking     |
|  PreCompact    -> save state before compaction |
|  Stop          -> Ralph loop (block if active) |
|  SessionEnd    -> harvest ratings, archive     |
+---------------------+-------------------------+
                      |
                      v
+-----------------------------------------------+
|  COMPLEXITY CLASSIFIER (automatic)             |
|                                                |
|  Simple       -> Direct execution, no ISC      |
|  Standard     -> 8+ ISC criteria               |
|  Deep         -> 24+ ISC, full algorithm       |
|  Comprehensive -> 64+ ISC, Ralph guarantee     |
+---------------------+-------------------------+
                      |
                      v
+-----------------------------------------------+
|  AGENTS (19 specialists)                       |
|                                                |
|  Tier 1 Haiku:  scout, formatter, explorer     |
|  Tier 2 Sonnet: executor, debugger, tester,    |
|    designer, content-writer, social-ops,       |
|    git-ops, security-reviewer, code-reviewer   |
|  Tier 3 Opus:   architect, analyst, critic,    |
|    brand-strategist, scientist, planner,       |
|    verifier                                    |
+---------------------+-------------------------+
                      |
                      v
+-----------------------------------------------+
|  SKILLS (three-layer composition)              |
|                                                |
|  Guarantee:   ralph, verify, autopilot         |
|  Enhancement: ultrawork, git-ops, anti-slop,   |
|               cancel                           |
|  Execution:   build, research, plan, analyze,  |
|               council, red-team                |
+---------------------+-------------------------+
                      |
                      v
+-----------------------------------------------+
|  STATE (.ira/ -- hook-managed persistence)     |
|                                                |
|  state/    -> ralph, autopilot, ultrawork,     |
|               current-agent, work.json         |
|  learning/ -> ratings.jsonl, reflections,      |
|               failures, synthesis              |
|  memory/   -> project memory files             |
|  telos/    -> life-context markdown files       |
|  user/     -> steering rules, opinions, style  |
+-----------------------------------------------+
```

See [Architecture Deep Dive](docs/ARCHITECTURE.md) for full system design.

---

## Agents

19 agents across 3 model tiers. Role boundaries enforced by the `boundary-enforcer` hook -- agents with `disallowedTools: ["Write", "Edit"]` are blocked from writing code.

| Agent | Tier | Model | Role | Read-Only |
|-------|------|-------|------|-----------|
| scout | 1 | Haiku | Quick file lookups, simple checks | Yes |
| formatter | 1 | Haiku | Code formatting, cleanup | No |
| explorer | 1 | Haiku | Codebase navigation, file search | Yes |
| executor | 2 | Sonnet | Implementation, standard coding | No |
| debugger | 2 | Sonnet | Bug isolation, root cause analysis | No |
| test-engineer | 2 | Sonnet | Test writing, coverage analysis | No |
| designer | 2 | Sonnet | UI/UX implementation | No |
| content-writer | 2 | Sonnet | Documentation, copy, content | No |
| social-ops | 2 | Sonnet | Social media content, scheduling | No |
| git-ops | 2 | Sonnet | Git operations, PR management | No |
| security-reviewer | 2 | Sonnet | Vulnerability scanning, OWASP | No |
| code-reviewer | 2 | Sonnet | Quality review, patterns | Yes |
| architect | 3 | Opus | System design, decisions | Yes |
| analyst | 3 | Opus | Requirements, ISC decomposition | Yes |
| critic | 3 | Opus | Plan validation, adversarial review | Yes |
| brand-strategist | 3 | Opus | Brand positioning, strategy | Yes |
| scientist | 3 | Opus | Hypothesis testing, experiments | Yes |
| planner | 3 | Opus | Implementation planning | No |
| verifier | 3 | Opus | Acceptance verification, evidence | Yes |

See [Agent Reference](docs/AGENTS.md) for full definitions.

---

## Skills

13 skills in three composable layers:

```
GUARANTEE (wraps everything)
  ralph       -- Loop until all ISC verified. Stop-hook enforced.
  verify      -- Evidence required for every claim.
  autopilot   -- Full pipeline: analyze -> plan -> build -> QA -> verify.

ENHANCEMENT (additive modifiers)
  ultrawork   -- Maximum parallelization (6 concurrent agents).
  git-ops     -- Commit management, branch ops, PR creation.
  anti-slop   -- Post-implementation cleanup. Remove AI cruft.
  cancel      -- Deactivate active modes.

EXECUTION (primary skill)
  build       -- Implementation work. Routes to executor/architect.
  research    -- Multi-agent parallel investigation.
  plan        -- Consensus planning: analyst + architect + critic.
  analyze     -- Deep root-cause analysis with 5-Whys.
  council     -- 4-agent multi-perspective debate.
  red-team    -- Adversarial stress-testing from 3 attack angles.
```

Compose them naturally: `ralph build with ultrawork and anti-slop` = parallel implementation that loops until verified with mandatory cleanup.

See [Skills Reference](docs/SKILLS.md) for all skills.

---

## Keywords

Natural language triggers detected by the `keyword-detector` hook:

| Keyword | What Happens |
|---------|-------------|
| `ralph` | Activate Ralph loop + ultrawork. Loop until verified. |
| `autopilot` | Full pipeline: analyze -> plan -> build -> QA -> verify |
| `ultrawork` | Maximum parallelization across agents |
| `council` | 4 agents debate from different perspectives |
| `red team` | Adversarial stress-test from security, scale, and UX angles |
| `research` | Multi-agent parallel investigation |
| `plan` | Consensus architecture planning with critic review |
| `analyze` | Deep root-cause analysis |
| `anti-slop` | Code cleanup pass |
| `cancel [mode]` | Cancel the named mode (e.g., "cancel ralph") |

Intent filtering prevents false activation -- "what is ralph?" won't trigger the skill.

---

## The Ralph Loop

Ralph is IRA's persistence guarantee. A Stop-hook blocks Claude from finishing until ISC criteria are verified complete.

```
User: "ralph build the auth system"
  |
  v
keyword-detector creates .ira/state/ralph-state.json
  |
  v
Claude implements auth system, generates ISC criteria
  |
  v
Claude tries to stop -> ralph-loop.mjs fires
  |
  +-- All ISC checked in work.json? -> Allow stop. Clean exit.
  |
  +-- Criteria remaining? -> Block stop.
      "[RALPH LOOP -- Iteration 3/25] Continue working."
      |
      v
      Claude continues -> tries to stop -> repeat
```

**Safety mechanisms:**
- 2-hour staleness timeout -- auto-deactivates stale loops
- Context limit stop -- never blocked
- User abort (`Ctrl+C`) -- always respected
- 25 iteration cap -- deactivates and reports what remains

---

## ISC Quality System

Every non-trivial task is decomposed into Ideal State Criteria -- atomic, binary-testable statements of what "done" looks like.

**The Splitting Test** (applied to every criterion):

1. Contains "and"/"with" joining two verifiable things? -> Split
2. Can part A pass while part B fails? -> Split
3. Contains "all"/"every"? -> Enumerate specifics
4. Crosses domain boundaries (UI/API/data)? -> One per domain

See [Quality System](docs/QUALITY.md) for full ISC methodology.

---

## CLI + tmux Sessions

IRA includes a CLI for managing persistent Claude Code sessions. Each project gets its own tmux session that survives disconnects, reboots, and SSH drops.

**Requires:** `tmux` (`sudo apt install tmux`)

### Setup

Add the alias to your shell (already done if you ran setup):
```bash
# In ~/.zshrc or ~/.bashrc
alias ira='bun run --cwd /path/to/ira cli --'
```

### Starting Sessions

```bash
# Start a session for a project (auto-names from directory)
ira tmux start --cwd ~/projects/foundry        # creates "ira-foundry"
ira tmux start --cwd ~/projects/refinery        # creates "ira-refinery"

# Start with explicit name
ira tmux start myapp --cwd ~/projects/myapp

# Start from inside a project directory (uses dirname as session name)
cd ~/projects/foundry && ira tmux start
```

Each session opens Claude Code in the project directory. You're auto-attached after creation.

### Attaching / Reconnecting

```bash
# Reattach to a session after disconnect
ira tmux attach foundry

# If only one session exists, no name needed
ira tmux attach

# If multiple sessions exist, it lists them for you to pick
ira tmux attach
#   Multiple IRA sessions found. Specify one:
#     ira-foundry
#     ira-refinery
#     ira-ira
```

### Detaching (without stopping)

From inside a tmux session, use the standard tmux detach:
- **`Ctrl+B` then `D`** -- detach from session (Claude keeps running)
- **`Ctrl+B` then `D`** is the most important shortcut -- it lets you leave without killing work

### Listing Sessions

```bash
ira tmux list

#   SESSION                 DIRECTORY                               CREATED               STATUS
#   ----------------------------------------------------------------...
#   ira-foundry             /home/user/projects/foundry             4/5/2026, 10:30 AM    attached
#   ira-refinery            /home/user/projects/refinery            4/5/2026, 11:15 AM    detached
#   ira-ira                 /home/user/golden-claw-workspace/ira    4/5/2026, 9:00 AM     detached
```

### Stopping Sessions

```bash
# Kill a specific session
ira tmux kill foundry

# If only one session, no name needed
ira tmux kill
```

### Team Mode (Parallel Agents)

Spawn multiple Claude instances in tmux panes, each given an agent role:

```bash
# 3 executor agents fixing TypeScript errors in parallel
ira team 3:executor "fix all TypeScript errors"

# 2 debuggers investigating a crash
ira team 2:debugger "investigate the auth timeout crash in production logs"

# 4 test-engineers writing tests for different modules
ira team 4:test-engineer "write e2e tests for the user dashboard"
```

Each pane runs `claude --prompt "[agent] your prompt"`. Panes are auto-tiled.

### Checking Status

```bash
ira status

#   IRA Status
#   ========================================
#
#   Active Modes:
#     ON  ralph
#     ON  ultrawork
#     OFF autopilot
#
#   Work Items:
#     auth-system.prd.md: 18/24 ISC complete (75%)
#
#   Active Sessions:
#     ira-foundry
#     ira-refinery
```

### Quick Reference

| Command | What It Does |
|---------|-------------|
| `ira tmux start [name] [--cwd path]` | Create and attach to a new session |
| `ira tmux attach [name]` | Reattach to an existing session |
| `ira tmux list` | List all IRA sessions with status |
| `ira tmux kill [name]` | Stop and remove a session |
| `ira team N:agent "prompt"` | N parallel Claude panes with agent role |
| `ira status` | Show modes, ISC progress, sessions |
| `ira help` | Full usage info |
| `Ctrl+B, D` | Detach from session (keeps it running) |
| `Ctrl+B, [` | Scroll up in tmux (exit with `q`) |
| `Ctrl+B, c` | New tmux window in same session |
| `Ctrl+B, n` / `Ctrl+B, p` | Next / previous tmux window |

### Typical Workflow

```bash
# Morning: start sessions for your projects
ira tmux start foundry --cwd ~/projects/foundry
# ... work with Claude on foundry ...

# Switch to another project (detach first)
# Ctrl+B, D
ira tmux start refinery --cwd ~/projects/refinery

# Later: reconnect to foundry where you left off
ira tmux attach foundry

# End of day: check what's running
ira tmux list

# Clean up finished work
ira tmux kill refinery
```

---

## Hooks

7 lifecycle hooks enforce behavior the AI cannot forget:

| Event | Script | What It Does |
|-------|--------|-------------|
| SessionStart | `context-loader.mjs` | Loads TELOS, project memory, active modes, learning signals, user config |
| UserPromptSubmit | `keyword-detector.mjs` | Keyword detection, complexity classification, state creation |
| PreToolUse | `boundary-enforcer.mjs` | Blocks disallowed tools for read-only agents |
| PostToolUse | `state-sync.mjs` | ISC progress tracking, agent identity tracking |
| PreCompact | `context-saver.mjs` | Saves ISC progress and mode state before context compaction |
| Stop | `ralph-loop.mjs` | Blocks premature stops when ralph is active |
| SessionEnd | `session-harvester.mjs` | Archives mode states, captures ISC ratings, writes events |

All hooks fail gracefully (exit 0, output `{}`). They never crash Claude Code.

See [Hooks Reference](docs/HOOKS.md) for details.

---

## Learning Loop

Every session feeds back into improvement:

```
Session Work -> ISC progress captured in ratings.jsonl
             -> Low ratings (<=3) injected as warnings on next SessionStart
             -> Failure dumps preserved in learning/failures/
             -> Pattern synthesis in learning/synthesis/
```

Learnings persist in `.ira/learning/` and are loaded by `context-loader.mjs` on session start.

See [Learning System](docs/LEARNING.md) for details.

---

## Configuration

Created by `setup.ts` at `~/.config/ira/config.jsonc`:

```jsonc
{
  // Model overrides per agent (optional)
  "agents": {
    "executor": { "model": "claude-sonnet-4-6" },
    "architect": { "model": "claude-opus-4-6" }
  },
  // Feature flags
  "features": {
    "ralph": true,
    "ultrawork": true,
    "anti-slop": true,
    "tmux": true
  },
  // TELOS integration
  "telos": {
    "enabled": true,
    "path": "~/.ira/telos/"
  },
  // Learning
  "learning": {
    "auto-capture-ratings": true,
    "failure-dump-threshold": 3
  }
}
```

---

## Project Structure

```
ira/
+-- CLAUDE.md              # System prompt -- injected into every session
+-- agents/                # 19 agent definitions (.md with YAML frontmatter)
+-- skills/                # 13 skill definitions (SKILL.md per skill)
|   +-- ralph/             # Guarantee: completion loop
|   +-- verify/            # Guarantee: evidence-based verification
|   +-- autopilot/         # Guarantee: full pipeline orchestration
|   +-- ultrawork/         # Enhancement: parallelization
|   +-- git-ops/           # Enhancement: commit management
|   +-- anti-slop/         # Enhancement: code cleanup
|   +-- cancel/            # Enhancement: mode deactivation
|   +-- build/             # Execution: implementation
|   +-- research/          # Execution: multi-agent investigation
|   +-- plan/              # Execution: consensus planning
|   +-- analyze/           # Execution: root-cause analysis
|   +-- council/           # Execution: multi-perspective debate
|   +-- red-team/          # Execution: adversarial stress-testing
+-- hooks/                 # 7 lifecycle hook scripts
|   +-- hooks.json         # Hook registration
|   +-- scripts/           # Hook implementations (.mjs)
+-- scripts/               # Setup, migration, CLI
|   +-- setup.ts           # First-time installation
|   +-- ira-cli.ts         # CLI (tmux, team, status)
|   +-- migrate-from-pai.ts# PAI data migration
|   +-- uninstall-pai.ts   # PAI removal + IRA hook registration
+-- docs/                  # Extended documentation
|   +-- ARCHITECTURE.md    # System design
|   +-- AGENTS.md          # Agent reference
|   +-- SKILLS.md          # Skills reference
|   +-- HOOKS.md           # Hook system
|   +-- QUALITY.md         # ISC methodology
|   +-- AUTOMATION.md      # Actions, Pipelines, Flows (planned)
|   +-- TELOS.md           # Life-context system
|   +-- LEARNING.md        # Learning loop
|   +-- MIGRATION.md       # PAI migration guide
+-- src/                   # TypeScript infrastructure (planned)
+-- .ira/                  # Runtime state (git-ignored)
+-- package.json
+-- tsconfig.json
```

---

## npm Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `setup` | `bun run setup` | First-time installation |
| `cli` | `bun run cli -- <cmd>` | CLI (tmux, team, status) |
| `migrate` | `bun run migrate -- --source <path>` | PAI data migration |
| `uninstall-pai` | `bun run uninstall-pai` | Remove PAI, install IRA |
| `uninstall-pai:dry-run` | `bun run uninstall-pai:dry-run` | Preview PAI removal |
| `uninstall-pai:restore` | `bun run uninstall-pai:restore` | Restore PAI from backup |
| `test` | `bun test` | Run tests |
| `lint` | `bun run lint` | TypeScript type check |

---

## Credits

IRA stands on the shoulders of two excellent projects:

- **[PAI](https://github.com/danielmiessler/Personal_AI_Infrastructure)** by Daniel Miessler -- ISC quality system, Algorithm structured execution, TELOS life context, Actions/Pipelines/Flows, continuous learning loop, SYSTEM/USER separation pattern.

- **[oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode)** by Yeachan Heo -- Ralph stop-hook persistence, three-layer skill composition, agent XML prompts with role boundaries, keyword detection with intent filtering, anti-slop as a first-class step, autopilot pipeline.

IRA combines PAI's quality rigor with OMC's execution efficiency.

---

## License

MIT
