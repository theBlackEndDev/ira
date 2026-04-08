---
name: review
description: USE WHEN reviewing code changes, PRs, or diffs. Multi-lens code review with parallel reviewers and synthesized findings.
layer: execution
level: 5
---

# Review

## What This Skill Does
Review performs multi-lens code review by dispatching 4 specialized reviewers in parallel, then synthesizing their findings into a single prioritized report with severity ratings (P0-P3) and autofix classification.

## When to Use
- Reviewing code changes before committing or merging
- PR review (own code or others')
- Post-implementation quality gate (called by ralph)
- When you want more than a single-perspective code review

## How It Works

### Phase 1: Scope Detection
Determine what to review:
- **Explicit files:** If the user specifies files, review those
- **Git diff:** If on a branch, review the diff against the base branch
- **PR:** If a PR number is given, fetch the PR diff via `gh pr diff`
- **Recent changes:** If none of the above, review unstaged + staged changes

### Phase 2: Parallel Review
Dispatch 4 reviewers via ultrawork (all run in parallel):

**code-reviewer** (Sonnet) — Quality, patterns, maintainability
- Code structure and readability
- Pattern consistency with codebase
- Complexity hotspots
- Must Fix / Should Fix / Nit / Praise

**security-reviewer** (Sonnet) — Vulnerabilities, OWASP
- Input validation, auth, injection risks
- Sensitive data handling
- Dependency vulnerabilities

**perf-reviewer** (Sonnet) — Performance
- N+1 queries, blocking I/O
- Algorithmic complexity on hot paths
- Memory allocation, bundle size
- P0-P3 severity with impact estimates

**test-reviewer** (Sonnet) — Test adequacy
- Coverage gaps for changed code
- Fragile tests, weak assertions
- Mock overuse hiding integration risks

Each reviewer receives: the diff/files to review, the project context, and instructions to return structured findings.

### Phase 3: Synthesis
**review-synthesizer** (Opus) aggregates all findings:
1. Deduplicate findings that reference the same issue from different angles
2. Assign unified severity: P0 (blocks merge) → P3 (consider)
3. Classify autofix potential: safe_auto | gated_auto | manual | advisory
4. Identify systemic patterns (3+ findings sharing a root cause)
5. Preserve praise from any reviewer
6. Resolve severity conflicts between reviewers (take the higher severity)

### Phase 4: Report
Present the unified report ordered by priority:
- P0 findings first (blockers)
- P1 findings (must fix before merge)
- P2 findings (fix soon)
- P3 findings (consider)
- Praise (reinforce good patterns)
- Systemic patterns (if any)

### Review Rules
- Each reviewer focuses only on their domain — no overlap by design
- Findings without file:line references are rejected
- P0/P1 findings from any reviewer cannot be suppressed during synthesis
- If no P0/P1 findings, the review is a PASS with notes
- If P0 findings exist, the review is a BLOCK with required actions

## Composition
- **Called by**: ralph (QA phase), autopilot (QA phase), standalone via keyword
- **Calls**: code-reviewer, security-reviewer, perf-reviewer, test-reviewer (via ultrawork), review-synthesizer
- **Feeds into**: build (P0/P1 findings become fix tasks), git-ops (if review passes, ready to commit)
