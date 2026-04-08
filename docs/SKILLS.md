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

### compound
**Trigger:** "compound" keyword, or auto-suggested by session-harvester
**Effect:** Extracts reusable solution docs from session work into `docs/solutions/`. Uses analyst + architect + explorer.

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

### analyze
**Trigger:** "analyze" keyword
**Effect:** Deep root-cause analysis. Uses debugger (Sonnet) for investigation, architect (Opus) for systemic issues.

### council
**Trigger:** "council" keyword
**Effect:** Multi-perspective debate. 4 agents argue from different angles: pragmatist, innovator, skeptic, user-advocate.

### review
**Trigger:** "review" keyword
**Effect:** Multi-lens code review. Dispatches 4 parallel reviewers (code, security, perf, test) via ultrawork, then synthesizes into P0-P3 prioritized report.

### brainstorm
**Trigger:** "brainstorm" keyword
**Effect:** Pre-planning requirements exploration. Pressure-tests problem framing, generates alternatives across 4 frames, produces requirements doc for plan skill.

### pr-resolve
**Trigger:** "pr resolve" or "resolve pr" keyword
**Effect:** Systematic PR feedback resolution. Triages threads, clusters related comments, applies fixes, drafts responses. All changes staged for user approval.

---

## Keyword Activation

Keywords detected by the `keyword-detector.mjs` hook at UserPromptSubmit time.

**Intent filtering:** Asking "what is ralph?" does NOT activate ralph. Only imperative usage triggers activation.

**Priority:** cancel > ralph > autopilot > ultrawork > council > red-team > research > plan > analyze > review > brainstorm > pr-resolve > compound > anti-slop > build


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
