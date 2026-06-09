---
name: plan
description: USE WHEN designing architecture, decomposing requirements, or creating implementation roadmaps. Three-agent consensus planning.
layer: execution
level: 6
---

# Plan

## What This Skill Does
Plan produces validated implementation plans through a three-agent consensus process. An analyst decomposes requirements, an architect designs the technical solution, and a critic validates the plan. All three must approve before the plan is finalized.

## When to Use
- Starting a new feature that spans multiple modules
- Redesigning or refactoring existing architecture
- Before ralph begins on complex tasks
- When the path forward is unclear and multiple approaches exist
- Any task estimated at more than 4 hours of implementation work

## How It Works

### Step 1: Requirements Gathering
1. Collect all available context:
   - User's request and any specifications
   - Relevant existing code (use research skill if codebase is unfamiliar)
   - Constraints: timeline, technology stack, backward compatibility
   - Prior decisions or ADRs that apply
2. If requirements are ambiguous, list assumptions explicitly

### Step 2: Analyst Pass (Opus tier)
The analyst agent decomposes the work:
1. Break the task into discrete deliverables
2. For each deliverable, identify:
   - What it depends on (other deliverables, external systems)
   - What depends on it (downstream deliverables)
   - Estimated complexity (trivial / standard / complex / architectural)
   - Risk factors (new technology, unclear requirements, performance sensitivity)
3. Order deliverables into phases based on dependency graph
4. Output: **Requirements Document** with deliverables, dependencies, and phases

### Step 3: Architect Pass (Opus tier)
The architect agent designs the solution:
1. Receive the analyst's requirements document
2. For each deliverable, specify:
   - Technical approach (patterns, libraries, APIs to use)
   - File changes required (new files, modified files, deleted files)
   - Interface contracts (function signatures, API shapes, data schemas)
   - Test strategy (what to test, how to test it)
3. Identify cross-cutting concerns:
   - Error handling strategy
   - Logging and observability
   - Security considerations
   - Performance implications
4. Output: **Technical Design** with approach per deliverable and cross-cutting plans

### Step 4: Critic Pass (Opus tier)
The critic agent validates the plan:
1. Receive both the requirements document and technical design
2. Challenge each decision:
   - Is this the simplest approach that works?
   - Are there hidden dependencies the analyst missed?
   - Does the architecture introduce unnecessary coupling?
   - Are the test strategies sufficient to catch regressions?
   - What failure modes are not covered?
3. Rate the plan: APPROVE, REVISE (with specific changes), or REJECT (with rationale)
4. Output: **Critique** with verdict and specific feedback

### Step 5: Consensus Loop
```
WHILE critic verdict != APPROVE:
  1. Analyst and architect review critique feedback
  2. Revise their outputs to address concerns
  3. Critic re-evaluates
  Max iterations: 3
  IF no consensus after 3 rounds:
    Output all three perspectives, flag disagreements, let user decide
```

### Step 6: Final Plan Output
```
## Implementation Plan

### Overview
[2-3 sentence summary of the approach]

### Phases
Phase 1: [name]
  - Deliverable: [what]
  - Approach: [how]
  - ISC Criteria: [success conditions]
  - Estimated effort: [time]

Phase 2: ...

### Dependencies
[Dependency graph in text form]

### Risks & Mitigations
[Known risks and how the plan addresses them]

### Test Strategy
[What tests are needed at each phase]

### ISC Criteria (Full)
[Complete list of all success criteria for the entire plan]
```

### Planning Rules
- Plans must be actionable — every phase should be executable by build skill without further clarification
- No phase should exceed 2 hours of implementation work — break it down further
- ISC criteria must be generated for every phase, not just the overall plan
- The plan is a living document — update it as implementation reveals new information

## Composition
- **Called by**: ralph (for complex tasks before implementation begins)
- **Calls**: research (for requirements gathering), ultrawork (to run analyst/architect/critic in parallel where possible)
- **Feeds into**: ralph (plan becomes the implementation roadmap), build (phases become build tasks)
