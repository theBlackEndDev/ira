# IRA — Intelligent Reasoning Assistant

> A next-generation AI orchestration system for Claude Code that combines structured quality assurance with autonomous execution.

IRA takes the best ideas from [PAI (Personal AI Infrastructure)](https://github.com/danielmiessler/Personal_AI_Infrastructure) and [oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode), strips the overhead, and builds something leaner and more powerful than either.

---

## What IRA Does

IRA transforms Claude Code from a conversational AI into an autonomous development platform with:

- **Zero-ceremony simple tasks** — No mode selection. Just work.
- **Full rigor for complex tasks** — Automatic complexity classification scales up ISC criteria, reviewer separation, and verification loops.
- **19 specialized agents** with static model routing (Haiku/Sonnet/Opus per agent)
- **Ralph loop** — Hook-enforced persistence that blocks completion until work is verified done
- **Three-layer skill composition** — Execution + Enhancement + Guarantee layers
- **ISC quality system** — Atomic, binary-testable Ideal State Criteria with the Splitting Test
- **Life-aware context** — TELOS integration for goal-aligned decision making
- **Composable automation** — Actions, Pipelines, and Flows for scheduled workflows
- **Learning loop** — Every session feeds ratings, reflections, and failure analysis back into improvement
- **tmux session persistence** — Never lose work when disconnected from servers

---

## Quick Start

```bash
# Clone into your workspace
git clone <repo-url> ~/ira

# Install
cd ~/ira && bun install

# Setup (creates ~/.claude symlinks and configures hooks)
bun run scripts/setup.ts

# If migrating from PAI
bun run scripts/migrate-from-pai.ts --source ~/.claude

# For remote machines with PAI data
bun run scripts/migrate-from-pai.ts --source user@server:~/.claude --harvest-only
```

---

## Architecture

```
User Input
    │
    ▼
┌─────────────────────────────────────────────┐
│  HOOKS (enforcement layer)                   │
│  SessionStart → Load context, TELOS, memory  │
│  UserPromptSubmit → Keyword detect + classify│
│  Stop → Ralph loop (block if incomplete)     │
│  PostToolUse → State sync, learn             │
│  SessionEnd → Harvest learnings              │
└─────────────┬───────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────┐
│  ROUTING (automatic complexity classifier)   │
│                                              │
│  Simple  (<2 min)  → Direct, no ceremony     │
│  Standard (<8 min) → ISC criteria (8+)       │
│  Deep    (<32 min) → Full Algorithm (5 phase)│
│  Comprehensive     → Algorithm + Ralph       │
└─────────────┬───────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────┐
│  AGENTS (19 specialists, auto-routed)        │
│                                              │
│  Tier 1 (Haiku):  scout, formatter, explorer │
│  Tier 2 (Sonnet): executor, debugger, tester │
│  Tier 3 (Opus):   architect, analyst, critic │
└─────────────┬───────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────┐
│  SKILLS (three-layer composition)            │
│                                              │
│  Guarantee:   ralph, verify                  │
│  Enhancement: ultrawork, git-ops, anti-slop  │
│  Execution:   build, research, plan, analyze │
└─────────────┬───────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────┐
│  STATE (.ira/ — hook-managed persistence)    │
│                                              │
│  state/    → Mode state (ralph, ultrawork)   │
│  work/     → PRD files per task              │
│  memory/   → Cross-session knowledge         │
│  learning/ → Ratings, reflections, failures  │
└─────────────────────────────────────────────┘
```

See [Architecture Deep Dive](docs/ARCHITECTURE.md) for the full system design.

---

## Core Concepts

### Automatic Complexity Classification

IRA detects task complexity and scales ceremony accordingly. No mode selection needed.

| Complexity | Detection | What Happens |
|------------|-----------|--------------|
| **Simple** | Single file, quick fix, Q&A | Direct execution. No ISC, no PRD. |
| **Standard** | Multi-file, feature work | 8+ ISC criteria. Lightweight verification. |
| **Deep** | Architecture, multi-system | 24+ ISC criteria. Full 5-phase algorithm. Reviewer separation. |
| **Comprehensive** | Full builds, major features | 64+ ISC criteria. Algorithm + Ralph loop guarantee. |

### Agents with Static Model Routing

Every agent carries its optimal model tier. No manual `model:` selection needed.

| Agent | Tier | Model | Role |
|-------|------|-------|------|
| scout | 1 | Haiku | Quick file lookups, simple checks |
| formatter | 1 | Haiku | Code formatting, cleanup |
| explorer | 1 | Haiku | Codebase navigation, file search |
| executor | 2 | Sonnet | Implementation, standard coding |
| debugger | 2 | Sonnet | Bug isolation, root cause analysis |
| test-engineer | 2 | Sonnet | Test writing, coverage analysis |
| designer | 2 | Sonnet | UI/UX implementation |
| content-writer | 2 | Sonnet | Documentation, copy, content |
| social-ops | 2 | Sonnet | Social media content, scheduling |
| git-ops | 2 | Sonnet | Git operations, PR management |
| security-reviewer | 2 | Sonnet | Vulnerability scanning, OWASP |
| code-reviewer | 2 | Sonnet | Quality review, patterns |
| architect | 3 | Opus | System design, architecture decisions |
| analyst | 3 | Opus | Requirements analysis, decomposition |
| critic | 3 | Opus | Plan validation, adversarial review |
| brand-strategist | 3 | Opus | Brand positioning, marketing strategy |
| scientist | 3 | Opus | Hypothesis testing, experiments |
| planner | 3 | Opus | Implementation planning, sequencing |
| verifier | 3 | Opus | Acceptance verification, evidence |

See [Agent Reference](docs/AGENTS.md) for complete agent definitions.

### Three-Layer Skill Composition

Skills compose in layers, not as a flat list:

```
GUARANTEE LAYER (optional — wraps everything)
  ralph: "Cannot stop until verified done"
  verify: "Evidence required for every claim"
    │
ENHANCEMENT LAYER (0-N additive)
  ultrawork: Maximum parallelization
  git-ops: Commit management
  anti-slop: Mandatory cleanup pass
    │
EXECUTION LAYER (primary skill)
  build: Implementation work
  research: Multi-agent investigation
  plan: Architecture and planning
  analyze: Debugging and root cause
```

Example: `ralph build with ultrawork and anti-slop` = Parallel implementation that loops until verified done with mandatory code cleanup.

See [Skills Reference](docs/SKILLS.md) for all skills.

### The Ralph Loop

Ralph is IRA's persistence guarantee. When activated, a Stop-hook intercepts Claude's "I'm done" signal and blocks it until ISC criteria are verified complete.

```
User: "ralph: build the auth system"
  │
  ▼
IRA activates ralph state
  │
  ▼
Claude implements auth system
  │
  ▼
Claude tries to stop → Stop hook fires
  │
  ├── ISC criteria all verified? → Allow stop. Clean exit.
  │
  └── Criteria remaining? → Block stop. Inject continuation.
      "RALPH LOOP — Iteration 3/20. Remaining: ISC-4, ISC-7.
       Continue working on unverified criteria."
      │
      ▼
      Claude continues working → tries to stop again → repeat
```

Safety: 2-hour staleness timeout, context limit detection, user abort always respected.

### ISC Quality System

Every non-trivial task gets decomposed into Ideal State Criteria — atomic, binary-testable statements of what "done" looks like.

**The Splitting Test** (applied to every criterion):
1. **"And/With" test** — If it joins two verifiable things, split them
2. **Independent failure test** — If A can pass while B fails, they're separate
3. **Scope word test** — "All", "every" must enumerate specifics
4. **Domain boundary test** — UI/API/data/logic = separate criteria

See [Quality System](docs/QUALITY.md) for ISC methodology.

### Learning Loop

Every session feeds back into IRA's improvement:

```
Session → Rating (1-10) → Reflection JSONL
                        → Failure dump (ratings 1-3)
                        → Pattern synthesis
                        → Algorithm adjustment
```

Learnings persist in `.ira/learning/` and inform future sessions.

---

## Keywords

Natural language triggers that activate skills automatically:

| Keyword | Activates | What It Does |
|---------|-----------|-------------|
| `ralph` | Ralph + Ultrawork | Loop until verified complete, with parallelism |
| `autopilot` | Full pipeline | Interview → plan → build → QA → verify |
| `ultrawork` | Parallelization | Maximum concurrent agent execution |
| `council` | Multi-perspective | 4 agents debate from different angles |
| `red team` | Adversarial | Stress-test a plan or decision |
| `research` | Multi-agent research | Parallel investigation across sources |
| `analyze` | Deep analysis | Root cause, decomposition |
| `plan` | Architecture planning | Consensus plan with critic review |
| `anti-slop` | Code cleanup | Remove AI-generated cruft |

Intent filtering prevents false activation — asking "what is ralph?" won't trigger the skill.

---

## tmux Integration

IRA supports tmux for persistent sessions on servers:

```bash
# Start IRA in a tmux session
ira tmux start [session-name]

# Attach to running session
ira tmux attach [session-name]

# List active sessions
ira tmux list

# Team mode — multiple agents in tmux panes
ira team 3:executor "fix all TypeScript errors"
```

Sessions persist through disconnections. Reconnect anytime without losing context.

---

## Migration from PAI

IRA includes a migration script that harvests learnings from existing PAI installations:

```bash
# Migrate local PAI
bun run scripts/migrate-from-pai.ts --source ~/.claude

# Harvest from remote machine (SSH)
bun run scripts/migrate-from-pai.ts --source user@server1:~/.claude --harvest-only

# Harvest from multiple machines
bun run scripts/migrate-from-pai.ts \
  --source user@server1:~/.claude \
  --source user@server2:~/.claude \
  --source user@server3:~/.claude \
  --merge-learnings
```

The migration script:
- Copies memory files, learnings, reflections, and failure analysis
- Converts PRD work history to IRA format
- Merges learning signals from multiple machines
- Preserves user customizations (TELOS, skills, opinions)
- Does NOT modify the source PAI installation

See [Migration Guide](docs/MIGRATION.md) for details.

---

## Project Structure

```
ira/
├── README.md              # This file
├── CLAUDE.md              # The brain — injected into every session
├── agents/                # 19 agent definitions (.md with YAML frontmatter)
│   ├── architect.md
│   ├── executor.md
│   ├── critic.md
│   └── ...
├── skills/                # Composable skill definitions
│   ├── ralph/SKILL.md
│   ├── ultrawork/SKILL.md
│   ├── build/SKILL.md
│   └── ...
├── hooks/                 # Lifecycle hook scripts
│   ├── hooks.json         # Hook registration
│   └── scripts/           # Hook implementations
├── docs/                  # Extended documentation
│   ├── ARCHITECTURE.md    # Full system design
│   ├── AGENTS.md          # Agent reference
│   ├── SKILLS.md          # Skills reference
│   ├── HOOKS.md           # Hook system reference
│   ├── QUALITY.md         # ISC and verification system
│   ├── AUTOMATION.md      # Actions, Pipelines, Flows
│   ├── TELOS.md           # Life-aware context system
│   ├── LEARNING.md        # Continuous improvement loop
│   └── MIGRATION.md       # PAI migration guide
├── scripts/               # Setup, migration, utilities
│   ├── setup.ts           # First-time installation
│   ├── migrate-from-pai.ts# PAI → IRA migration
│   └── ira-cli.ts         # CLI entry point
├── src/                   # TypeScript infrastructure
│   ├── config/            # Configuration and model routing
│   ├── features/          # Complexity classification, delegation
│   ├── hooks/             # Hook implementations
│   └── state/             # State management
├── .ira/                  # Runtime state (git-ignored)
│   ├── state/             # Mode state (ralph, ultrawork)
│   ├── work/              # PRD files per task
│   ├── memory/            # Cross-session knowledge
│   ├── learning/          # Ratings, reflections, failures
│   └── events.jsonl       # Unified event log
├── package.json
├── tsconfig.json
└── bunfig.toml
```

---

## Configuration

IRA uses a single config file at `~/.config/ira/config.jsonc`:

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
    "tmux": true,
    "voice-notifications": false
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

## Credits

IRA stands on the shoulders of two excellent projects:

- **[PAI (Personal AI Infrastructure)](https://github.com/danielmiessler/Personal_AI_Infrastructure)** by Daniel Miessler — The ISC quality system, Algorithm structured execution, TELOS life context, Actions/Pipelines/Flows composability, CLI-First architecture, continuous learning loop, and the SYSTEM/USER separation pattern all originate from PAI. PAI proved that AI systems need scaffolding to be reliable.

- **[oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode)** by Yeachan Heo — The Ralph stop-hook persistence pattern, three-layer skill composition, agent XML prompt structure with role boundaries, keyword detection with intent filtering, session-scoped state isolation, anti-slop as a first-class workflow step, and the autopilot pipeline all originate from OMC. OMC proved that prompt engineering at scale can orchestrate complex multi-agent workflows.

IRA combines PAI's quality rigor with OMC's execution efficiency, drops the overhead neither system needs, and adds what both were missing.

---

## License

MIT
