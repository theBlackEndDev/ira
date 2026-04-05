# IRA Skills Reference

> Three-layer composable skills for execution, enhancement, and guarantees.

---

## Composition Model

```
GUARANTEE (optional wrapper — enforces completion)
    │
ENHANCEMENT (0-N additive — modifies behavior)
    │
EXECUTION (primary — defines what to do)
```

Example: `ralph build with ultrawork and anti-slop`
= Build (execution) + Ultrawork (parallel) + Anti-slop (cleanup) + Ralph (loop until done)

---

## Guarantee Layer

### ralph
**Trigger:** "ralph" keyword
**Effect:** Loop until all ISC criteria verified. Stop-hook blocks premature exit.
**Auto-includes:** ultrawork (parallel execution)
**Safety:** 2-hour staleness, context limit detection, user abort respected

### verify
**Trigger:** Deep+ complexity (automatic)
**Effect:** Requires concrete evidence for every ISC criterion. "I checked" is not evidence.

---

## Enhancement Layer

### ultrawork
**Trigger:** "ultrawork" keyword, or auto-included by ralph
**Effect:** Maximum parallelization. Routes tasks to correct agent tiers. Fires independent tasks simultaneously.
**Limit:** 6 concurrent child agents

### anti-slop
**Trigger:** "anti-slop" keyword, or auto-included by ralph
**Effect:** Post-implementation cleanup. Removes AI cruft: unnecessary comments, dead code, over-engineering.

### git-ops
**Trigger:** "git-ops" keyword
**Effect:** Commit management, branch operations, PR creation with proper descriptions.

---

## Execution Layer

### build
**Trigger:** "build" keyword, or default for implementation tasks
**Effect:** Implementation work. Routes to executor (Sonnet) for code, architect (Opus) for design.

### research
**Trigger:** "research" keyword
**Effect:** Multi-agent parallel investigation. Quick (1 agent), Standard (2), Deep (4).

### plan
**Trigger:** "plan" keyword
**Effect:** Consensus planning. Analyst decomposes, architect designs, critic validates.

### analyze (planned)
**Trigger:** "analyze" keyword
**Effect:** Deep root-cause analysis. Uses debugger (Sonnet) for investigation, architect (Opus) for systemic issues.
**Status:** Keyword detection active; SKILL.md not yet implemented.

### council
**Trigger:** "council" keyword
**Effect:** Multi-perspective debate. 4 agents argue from different angles: pragmatist, innovator, skeptic, user-advocate.

---

## Keyword Activation

Keywords detected by the `keyword-detector.mjs` hook at UserPromptSubmit time.

**Intent filtering:** Asking "what is ralph?" does NOT activate ralph. Only imperative usage triggers activation.

**Priority:** cancel > ralph > autopilot > ultrawork > council > red-team > research > plan > analyze > anti-slop > build

> **Note:** cancel, autopilot, red-team, and analyze have keyword detection but no SKILL.md definitions yet. They are planned.

---

## Adding Custom Skills

Create `skills/{name}/SKILL.md` with:

```yaml
---
name: skill-name
description: USE WHEN [triggers]. What it does.
layer: execution | enhancement | guarantee
level: 3-7
---
```

Custom skills are automatically available via keyword detection if their trigger words are registered.
