---
name: ralph
description: USE WHEN task requires guaranteed completion with verification. Loops implementation until all success criteria are met with evidence.
layer: guarantee
level: 7
---

# Ralph

## What This Skill Does
Ralph is the completion guarantee loop. It takes a task description, generates a PRD with ISC (Implementation Success Criteria), then iterates through implement-verify cycles until every criterion is satisfied with concrete evidence. It will not exit until the work is done or the iteration cap is hit.

## When to Use
- Activated explicitly via the "ralph" keyword in a request
- Any task where partial completion is unacceptable
- Multi-file changes that must all land correctly
- Tasks with testable acceptance criteria

## How It Works

### Phase 1: PRD Generation
1. Parse the task description into discrete deliverables
2. For each deliverable, generate 2-5 ISC criteria that are binary pass/fail
3. Each ISC criterion MUST be verifiable by an automated check (test run, grep, file existence, build success)
4. Write the PRD to a state file at `.ralph/prd.md` in the working directory
5. Log iteration count: 0

### Phase 2: Implementation Loop
```
FOR iteration IN 1..max_iterations:
  1. Activate ultrawork skill for parallel execution of independent subtasks
  2. Execute implementation work via build skill
  3. Run verify skill against every ISC criterion
  4. Collect evidence map: { criterion -> evidence | null }
  5. IF all criteria have evidence: proceed to Phase 3
  6. IF any criteria lack evidence:
     - Log which criteria failed and why
     - Adjust implementation plan for next iteration
     - CONTINUE loop
```

### Phase 3: Anti-Slop Pass
1. Activate anti-slop skill on all changed files
2. Review diff output — reject if logic changed
3. Re-run verify skill to confirm anti-slop did not break anything

### Phase 4: Reviewer Verification
1. Spawn a verifier agent (Opus tier) with fresh context
2. Verifier receives: original task, ISC criteria, evidence map
3. Verifier independently checks each criterion against evidence
4. IF verifier rejects any criterion: return to Phase 2 with verifier notes
5. IF verifier approves all: proceed to clean exit

### Phase 5: Clean Exit
1. Remove `.ralph/` state directory
2. Output final summary: iterations used, criteria met, evidence references
3. Release all child agents

### Stop-Hook
Ralph installs a stop-hook that blocks premature exit. If the agent attempts to respond before all ISC criteria are verified, the hook intercepts and forces continuation. The only valid exits are:
- All criteria verified by reviewer
- Max iterations reached (report partial completion with evidence gap)

### Iteration Limits
- Default max: 20 iterations
- If iteration 18 is reached with progress being made, auto-extend by 10
- Hard cap: 30 iterations — at this point, output what was achieved and what remains

## Composition
- **Activates ultrawork**: Always, for parallel subtask execution
- **Activates build**: For implementation phases
- **Activates verify**: After each implementation cycle
- **Activates anti-slop**: Once before final verification
- **Layers under**: Nothing — ralph is the top-level orchestrator when active
