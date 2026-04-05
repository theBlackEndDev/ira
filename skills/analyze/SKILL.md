---
name: analyze
description: USE WHEN debugging complex issues, investigating failures, or performing root-cause analysis. Multi-agent investigation.
layer: execution
level: 5
---

# Analyze

## What This Skill Does
Analyze performs deep root-cause analysis on complex issues by coordinating multiple specialist agents through three phases: evidence gathering, systemic analysis, and recommendation. It produces a structured Root Cause Analysis report with an evidence chain.

## When to Use
- Debugging failures that span multiple components or services
- Investigating intermittent or hard-to-reproduce bugs
- Understanding why a system behaves unexpectedly
- Post-incident analysis after production issues
- When a simple "read the error message" approach has already failed

## How It Works

### Phase 1: Gather Evidence
Two agents investigate in parallel:

**Debugger** (debugger, Sonnet)
- Examine logs, stack traces, error messages
- Inspect application state at the point of failure
- Trace execution paths through the code
- Identify what changed recently (commits, config, dependencies)

**Explorer** (explorer, Haiku)
- Search the codebase for related code and dependencies
- Find recent changes to affected files (git log, git blame)
- Map the dependency chain from symptom to possible causes
- Identify similar patterns elsewhere in the codebase

### Phase 2: Analyze
One agent synthesizes the evidence:

**Architect** (architect, Opus)
- Review all evidence from Phase 1
- Apply 5-Whys methodology to trace the root cause:
  1. Why did the symptom occur?
  2. Why did that condition exist?
  3. Why was that condition possible?
  4. Why wasn't it caught earlier?
  5. Why doesn't the system prevent this class of issue?
- Determine if this is a design flaw or a code bug
- Identify systemic patterns that enabled the failure

### Phase 3: Recommend
Produce a structured Root Cause Analysis report:

```
## Root Cause Analysis

### Symptom
[What was observed — the user-visible or system-visible failure]

### Root Cause
[The fundamental reason the failure occurred]

### Evidence Chain
1. [Observation] → led to investigating [area]
2. [Finding] → narrowed cause to [component]
3. [Evidence] → confirmed root cause is [X]

### Classification
- Type: code bug | design flaw | configuration error | external dependency
- Severity: critical | high | medium | low
- Blast radius: [what else could be affected]

### Contributing Factors
- [Factor 1: why the root cause was able to manifest]
- [Factor 2: why it wasn't caught earlier]

### Recommendations
**Immediate fix**: [What to do right now to resolve the issue]
**Systemic fix**: [What to change to prevent this class of issue]
**Detection**: [How to catch this earlier next time — monitoring, tests, alerts]
```

### Analyze Rules
- Follow the evidence, not assumptions — every conclusion must cite specific evidence
- Do not stop at the first plausible explanation — verify it explains all symptoms
- Distinguish between root cause and contributing factors
- Recommendations must address both the immediate issue and the systemic gap
- If the root cause cannot be determined with available evidence, say so and identify what additional information is needed

## Composition
- **Called by**: ralph (during implementation when issues arise), autopilot (Phase 1)
- **Calls**: debugger (Sonnet), explorer (Haiku), architect (Opus) agents
- **Feeds into**: build (fix recommendations become implementation tasks)
