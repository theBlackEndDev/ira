---
name: compound
description: USE WHEN a hard problem was just solved and the solution should be documented for reuse. Extracts structured solution docs.
layer: enhancement
level: 4
---

# Compound

## What This Skill Does
Compound extracts reusable solution documentation from the current session's work. It turns hard-won debugging insights, architectural decisions, and implementation patterns into searchable, structured docs in `docs/solutions/` so future sessions can find and apply them instantly.

## When to Use
- After solving a difficult bug (especially one that took investigation)
- After making a non-obvious architectural decision with rationale
- After discovering a pattern that would help with similar future problems
- Triggered manually via "compound" keyword
- Auto-suggested by session-harvester when ISC completion >= 80% on standard+ tasks

## How It Works

### Phase 1: Context Analysis
**analyst** (Opus) — Extract the key facts:
- What was the problem? (symptoms, error messages, affected components)
- What was the root cause?
- What category does this fall into? (debugging, architecture, integration, performance, security)
- What module/component was affected?
- How severe was it?

### Phase 2: Solution Extraction
**architect** (Opus) — Distill into a reusable document:

For **bug fixes**:
- Problem: What went wrong
- Symptoms: How it manifested
- What Didn't Work: Dead ends (saves future investigators time)
- Solution: The actual fix
- Why This Works: The underlying mechanism
- Prevention: How to avoid this class of issue

For **decisions/patterns**:
- Context: Why this decision was needed
- Guidance: The pattern or approach chosen
- Why This Matters: The trade-offs and rationale
- When to Apply: Conditions where this pattern fits
- Examples: Concrete usage from the current implementation

### Phase 3: Deduplication Check
**explorer** (Haiku) — Search existing docs:
- Grep `docs/solutions/` for related entries by keywords, module, and category
- If a duplicate exists: update the existing doc instead of creating a new one
- If a related doc exists: add cross-references
- If no related docs: create new

### Phase 4: Write Solution Doc
Create `docs/solutions/{category}/{date}_{slug}.md`:

```yaml
---
category: debugging | architecture | integration | performance | security
problem_type: root-cause | design-decision | migration | optimization
tags: [searchable, relevant, tags]
module: affected-module-name
severity: critical | high | medium | low
root_cause: one-line root cause summary
created: YYYY-MM-DD
---
```

Body follows the bug-fix or decision template from Phase 2.

### Compound Rules
- Solution docs must be grounded in the session's actual work — no hypothetical advice
- Dead ends are as valuable as the solution — document what didn't work and why
- Tags must be specific enough to find via grep (not just "bug" or "fix")
- Cross-references to related docs are required when they exist
- If the session's work doesn't contain a reusable insight, say so — don't force a doc

## Auto-Trigger Integration
The session-harvester hook writes `.ira/state/compound-pending.json` when:
- ISC completion >= 80%
- Complexity >= "standard"
- Session included debugging, architecture decisions, or non-trivial problem-solving

On next session start, context-loader reads this file and prompts:
"Last session solved [problem]. Save as a reusable solution doc?"

## Composition
- **Called by**: session-harvester (auto-suggest), standalone via keyword
- **Calls**: analyst (context extraction), architect (solution distillation), explorer (dedup check)
- **Feeds into**: Future sessions via context-loader (greps docs/solutions/ for relevant patterns)
