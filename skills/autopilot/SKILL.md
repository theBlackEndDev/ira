---
name: autopilot
description: USE WHEN a task should be fully automated end-to-end. Runs the complete pipeline from analysis through deployment prep.
layer: guarantee
level: 7
---

# Autopilot

## What This Skill Does
Autopilot orchestrates the full development pipeline end-to-end: analyze requirements, plan the architecture, build the implementation, run QA, and verify all criteria are met. Each phase gates the next — no phase begins until the previous one passes. Like ralph, autopilot enforces completion via stop-hook and cannot be exited early.

## When to Use
- When the user says "autopilot" or wants hands-off end-to-end execution
- Tasks where the full pipeline (analyze, plan, build, QA, verify) applies
- Feature implementation that should go from zero to verified without manual intervention
- When you want ralph-level guarantee but with structured phasing

## How It Works

### Phase 1: Analyze
1. Activate the **analyze** skill on the task
2. Produce: requirements, constraints, ISC criteria (8+ criteria minimum)
3. **Gate**: requirements must be clear and ISC criteria must be defined
4. If gate fails: refine requirements, ask clarifying questions, re-analyze

### Phase 2: Plan
1. Activate the **plan** skill
2. Analyst (Opus) decomposes the task into implementation steps
3. Architect (Opus) designs the technical approach
4. Critic (Opus) validates the plan for gaps and risks
5. **Gate**: plan must pass critic review without critical objections
6. If gate fails: address critic's objections, revise plan, re-validate

### Phase 3: Build
1. Activate the **build** skill with **ultrawork** for maximum parallelization
2. Implement according to the approved plan
3. Follow TDD: tests first (RED), then implementation (GREEN), then refactor
4. **Gate**: all code compiles, no lint errors, no type errors
5. If gate fails: fix build errors, re-run checks

### Phase 4: QA
1. Run **anti-slop** pass on all changed files (dead code, unnecessary complexity, poor naming)
2. Execute all tests: unit, integration, end-to-end
3. **Gate**: all tests pass, anti-slop comes back clean
4. If gate fails: fix failing tests, re-run anti-slop, iterate until clean

### Phase 5: Verify
1. Spawn **verifier** agent (Opus) with fresh context (no implementation bias)
2. Verifier checks every ISC criterion against the actual implementation
3. Each criterion must have concrete evidence of passing (file paths, test output, behavior)
4. **Gate**: all ISC criteria PASS with evidence
5. If gate fails: identify which criteria failed, return to Phase 3 to fix, then re-verify

### State Tracking
Autopilot creates state at `.ira/state/autopilot-state.json`:
```json
{
  "active": true,
  "startedAt": "2026-04-04T...",
  "currentPhase": 1,
  "phases": {
    "1_analyze": "complete",
    "2_plan": "in_progress",
    "3_build": "pending",
    "4_qa": "pending",
    "5_verify": "pending"
  },
  "iscCriteria": ["ISC-1: ...", "ISC-2: ..."],
  "gateFailures": []
}
```

### Stop-Hook Enforcement
The stop-hook checks autopilot state. If `active: true` and `currentPhase < 5` or Phase 5 has unverified criteria, the agent is blocked from stopping and must continue the pipeline.

### Autopilot Rules
- Every phase must complete before the next begins — no skipping
- Gate failures are expected and normal — iterate until the gate passes
- The verifier in Phase 5 must be a fresh context, not the same agent that built
- If a phase fails 3 times consecutively, pause and report the blocker to the user
- Autopilot can be cancelled with the **cancel** skill at any time

## Composition
- **Top-level orchestrator** (same tier as ralph)
- **Activates**: analyze (Phase 1), plan (Phase 2), build + ultrawork (Phase 3), anti-slop (Phase 4), verify (Phase 5)
- **State**: managed via `.ira/state/autopilot-state.json`
- **Cancelled by**: cancel skill
