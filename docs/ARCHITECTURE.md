# IRA Architecture

> Full system design for the Intelligent Reasoning Assistant.

---

## Design Principles

1. **Zero ceremony for simple tasks, full rigor for complex ones** — The system detects complexity and scales up automatically. No mode selection.
2. **Hooks enforce, not prompts** — If something must happen, a hook guarantees it. The AI cannot forget.
3. **Agents are first-class with static model routing** — Every agent carries its default model. Override when needed, not every time.
4. **Skills compose in layers** — Execution + Enhancement + Guarantee (not a flat list).
5. **ISC criteria for quality** — Atomic, binary-testable Ideal State Criteria with the Splitting Test.
6. **Loop until done** — Ralph's stop-hook pattern for any non-trivial task.
7. **Life-aware context** — TELOS integrated into routing, not a separate skill.
8. **CLI-First** — Deterministic tools wrapped by AI.
9. **Learn from every session** — Ratings, failure analysis, reflections feed improvement.
10. **SYSTEM/USER separation** — Safe upgrades with partial overrides.

---

## Layer Model

IRA operates in 7 layers, each with clear responsibilities:

### 1. Hooks Layer (Enforcement)

Hooks are external scripts that intercept Claude Code lifecycle events. They are the nervous system — they enforce behavior that prompts alone cannot guarantee.

| Event | Hook | Purpose |
|-------|------|---------|
| SessionStart | `context-loader.mjs` | Load .ira/ state, TELOS, project memory |
| UserPromptSubmit | `keyword-detector.mjs` | Detect keywords, classify complexity |
| PreToolUse | `boundary-enforcer.mjs` | Enforce agent role boundaries |
| PostToolUse | `state-sync.mjs` | Sync ISC progress, extract learnings |
| PreCompact | `context-saver.mjs` | Save critical state before compaction |
| Stop | `ralph-loop.mjs` | Block premature stops (if ralph active) |
| SessionEnd | `session-harvester.mjs` | Harvest learnings, ratings, reflections |

All hooks: fail gracefully (exit 0), complete in <5s, emit structured JSON.

### 2. Routing Layer (Classification)

Automatic complexity classification based on task signals:

| Signal | Simple | Standard | Deep | Comprehensive |
|--------|--------|----------|------|---------------|
| Files involved | 1-2 | 3-10 | 10+ | System-wide |
| Keywords | fix, check, update | build, add, implement | design, architect, refactor | ralph, autopilot |
| ISC count | 0 | 8+ | 24+ | 64+ |
| Algorithm phases | 0 | 3 (plan, execute, verify) | 5 (all) | 5 + Ralph |
| Reviewer separation | No | No | Yes | Yes |

Classification happens in the `keyword-detector.mjs` hook at UserPromptSubmit time.

### 3. Agent Layer (Execution)

19 agents organized by model tier. Each agent is a markdown file with:
- YAML frontmatter (name, model, tier, disallowed tools)
- XML prompt body (Role, Constraints, Success Criteria, Failure Modes, Final Checklist)

Agents have enforced role boundaries:
- **architect** cannot write code (disallowed: Write, Edit)
- **critic** cannot implement (disallowed: Write, Edit)
- **executor** cannot make architecture decisions
- Author and reviewer are never the same agent

### 4. Skill Layer (Composition)

Three-layer composition model:

```
GUARANTEE (optional wrapper)
  └── ralph: Blocks stop until verified
  └── verify: Requires evidence for claims

ENHANCEMENT (0-N additive)
  └── ultrawork: Parallel agent execution
  └── git-ops: Commit management
  └── anti-slop: Code cleanup pass

EXECUTION (primary behavior)
  └── build: Implementation
  └── research: Investigation
  └── plan: Architecture planning
  └── analyze: Root cause analysis
  └── council: Multi-perspective debate
```

### 5. Quality Layer (ISC)

The Ideal State Criteria system:
- Decompose every non-trivial task into atomic criteria
- Apply the Splitting Test to prevent compound criteria
- Track progress: `- [ ] ISC-1: Description` → `- [x] ISC-1: Description`
- Evidence required in verification section
- Anti-criteria (`ISC-A-*`) define what must NOT happen

### 6. State Layer (.ira/)

File-based persistent state, managed by hooks (not the AI):

```
.ira/
  state/           # Active mode state (ralph, ultrawork)
    sessions/      # Per-session isolation
  work/            # PRD files per task
  memory/          # Cross-session project knowledge
  learning/        # Ratings, reflections, failures
    reflections/   # Algorithm performance JSONL
    failures/      # Full context dumps (rating 1-3)
    synthesis/     # Aggregated patterns
  events.jsonl     # Unified append-only event log
```

### 7. Context Layer (TELOS)

Life-aware context that informs decision making:
- Mission, goals, beliefs, wisdom
- Projects and their dependencies
- Integrated into agent routing (not a separate skill)
- Influences scoring, prioritization, and recommendations

---

## Comparison: IRA vs PAI vs OMC

| Aspect | PAI | OMC | IRA |
|--------|-----|-----|-----|
| Simple task overhead | Mode selection + format | Keyword detect | Auto-classify (zero) |
| Complex task quality | ISC + 7 phases | PRD + reviewer | ISC + 5 phases + Ralph |
| Agent count | Generic Agent tool | 19 (29 with aliases) | 19 (clean roster) |
| Model routing | Manual per call | Static per agent | Static per agent |
| Completion guarantee | PRD self-managed | Stop-hook (Ralph) | Stop-hook (Ralph) |
| Skill composition | Flat list | 3 layers | 3 layers |
| State management | AI writes PRD | Hooks manage .omc/ | Hooks manage .ira/ |
| Learning | Ratings + reflections | None | Ratings + reflections |
| Life context | TELOS (separate skill) | None | TELOS (integrated) |
| Automation | Actions/Pipelines/Flows | None | Actions/Pipelines/Flows |
| Token overhead | ~3-4K per complex task | ~1-2K per task | ~1K simple, ~2K complex |
| tmux support | No | Yes (for teams) | Yes (sessions + teams) |

---

## Data Flow

```
User types "ralph: build auth system with tests"
  │
  ├── keyword-detector.mjs fires
  │   ├── Detects: "ralph" → activate ralph state
  │   ├── Detects: "build" → execution skill
  │   ├── Classifies: Deep complexity (multi-file, tests)
  │   └── Injects: skill context + ISC requirements
  │
  ├── CLAUDE.md processes
  │   ├── Creates PRD with ISC criteria (24+)
  │   ├── Routes to executor (Sonnet) for implementation
  │   ├── Routes to test-engineer (Sonnet) for tests
  │   └── Routes to verifier (Opus) for acceptance
  │
  ├── Execution proceeds
  │   ├── state-sync.mjs tracks ISC progress after each tool use
  │   └── boundary-enforcer.mjs prevents role violations
  │
  ├── Claude tries to stop
  │   ├── ralph-loop.mjs fires
  │   ├── Checks .ira/state/ralph-state.json
  │   ├── ISC-3, ISC-7 still unchecked → block stop
  │   └── Inject continuation: "Continue. Remaining: ISC-3, ISC-7"
  │
  ├── Claude completes remaining criteria
  │   ├── All ISC verified → ralph-loop allows stop
  │   └── Anti-slop pass runs on modified files
  │
  └── session-harvester.mjs fires
      ├── Capture rating prompt
      ├── Log reflection to JSONL
      └── Archive work state
```
