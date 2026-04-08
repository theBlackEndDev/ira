---
name: brainstorm
description: USE WHEN exploring requirements, challenging problem framing, or refining ideas before planning. Pressure-tests the stated problem.
layer: execution
level: 6
---

# Brainstorm

## What This Skill Does
Brainstorm is the pre-planning phase that pressure-tests whether the stated problem is the real problem. It scans context, challenges assumptions, generates alternatives across multiple frames, and produces a refined requirements document for the plan skill to consume.

## When to Use
- Before planning a new feature or system change
- When the user's request might be solving a symptom instead of the root cause
- When the scope is unclear and needs exploration
- When multiple valid approaches exist and the trade-offs aren't obvious
- Automatically invoked by autopilot before the plan phase

## How It Works

### Phase 1: Context Scan
**explorer** (Haiku) — Gather relevant context:
- Scan codebase for related code, patterns, and existing solutions
- Check `docs/solutions/` for relevant past learnings (if compound skill is active)
- Review recent git history for related changes
- Identify existing constraints and dependencies

### Phase 2: Pressure Test
**critic** (Opus) — Challenge the stated problem:
1. **Is this the real problem?** — Or is it a symptom of something deeper?
2. **What assumptions are embedded?** — What constraints are assumed that might not be real?
3. **What if we did nothing?** — What's the actual cost of inaction?
4. **Is there a simpler framing?** — Can we reduce the problem before solving it?
5. **Who else is affected?** — Are there stakeholders or systems we're not considering?

Present pressure test results to the user. If the problem framing changes, restart from Phase 1 with the new framing.

### Phase 3: Ideation
Generate 10-15 approaches using four distinct frames (generate ALL first, then critique ALL — no premature filtering):

**Frame 1 — User Pain:** What is the user actually struggling with? What would make them delighted?

**Frame 2 — Inversion:** What if we removed something instead of adding? What if we eliminated the need for this feature entirely?

**Frame 3 — Assumption-Breaking:** What constraints are we assuming that aren't real? What would we do if we had no legacy code?

**Frame 4 — Leverage:** What small change would have outsized impact? Where is the highest ROI intervention?

After generating all ideas, critique them as a batch:
- Which ideas address the root problem vs. symptoms?
- Which have the best effort-to-impact ratio?
- Which compound (make future work easier)?

### Phase 4: Requirements Document
Produce a structured requirements output:

```
## Requirements: [Title]

### Problem Statement
[Refined problem statement after pressure testing]

### Context
[Key findings from context scan]

### Approach
[Recommended approach with rationale]

### Alternatives Considered
[Top 2-3 alternatives and why they were not chosen]

### Scope
- In scope: [explicit list]
- Out of scope: [explicit list]
- Open questions: [things that need answers during planning]

### Success Criteria
[What "done" looks like — feeds directly into ISC generation]
```

### Brainstorm Rules
- The pressure test is not optional — every brainstorm must challenge the problem framing
- Generate-then-critique, never filter during generation (prevents anchoring bias)
- The output is a requirements document, not a plan — planning is the plan skill's job
- If the user's original request survives the pressure test unchanged, that's fine — the point is to verify, not to change
- Open questions must be explicitly listed — don't hide uncertainty

## Composition
- **Called by**: autopilot (Phase 1, before plan), standalone via keyword
- **Calls**: explorer (Haiku) for context, critic (Opus) for pressure test
- **Feeds into**: plan (requirements document becomes plan input)
