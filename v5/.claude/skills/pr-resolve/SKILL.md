---
name: pr-resolve
description: USE WHEN PR has review feedback to address. Triages, fixes, and responds to PR review comments systematically.
layer: execution
level: 5
---

# PR Resolve

## What This Skill Does
PR Resolve systematically processes pull request review feedback — triaging each thread, applying fixes for valid feedback, clustering related comments into systemic fixes, and drafting responses. All changes are staged for user approval before pushing.

## When to Use
- A PR has review comments that need addressing
- After receiving code review feedback from teammates
- When review threads are piling up and need batch processing
- Triggered by "pr resolve" or "resolve pr" keyword

## How It Works

### Phase 1: Fetch Feedback
Use `gh` CLI to pull all review comments and threads:
```bash
gh pr view [number] --json reviews,comments,reviewRequests
gh api repos/{owner}/{repo}/pulls/{number}/comments
```
Parse into structured thread objects: reviewer, file, line, comment text, thread status (open/resolved).

### Phase 2: Cluster Analysis
Before processing individual threads, check for patterns:
- Group comments by theme (e.g., 3 comments about error handling)
- If 3+ comments share a root cause → flag as systemic issue
- Systemic issues get one fix, not N point fixes
- Present clusters to user before proceeding

### Phase 3: Triage
**pr-resolver** (Sonnet) processes each thread:

| Verdict | Meaning | Action |
|---------|---------|--------|
| `fixed` | Feedback is valid, applying the suggested fix | Edit code, run tests |
| `fixed-differently` | Valid concern, but a better solution exists | Edit code, draft explanation |
| `replied` | Feedback is based on misunderstanding | Draft clarifying response |
| `not-addressing` | Disagree with feedback | Draft rationale |
| `needs-human` | Requires product/design decision | Flag for user |

### Phase 4: Apply Fixes
For `fixed` and `fixed-differently` verdicts:
1. Apply code changes via executor agent
2. Run relevant tests to verify no regressions
3. If a fix conflicts with another thread's fix, flag the conflict

### Phase 5: Verify
Run the verify skill on all changes:
- Do all tests still pass?
- Do fixes actually address the reviewer's concern?
- Are there any unintended side effects?

### Phase 6: Report
Present the full resolution report to the user:
- Thread-by-thread verdicts with actions taken
- Systemic fixes applied
- Draft responses for non-fix threads
- Changes summary with `git diff` ready for review

### PR Resolve Rules
- NEVER push without user approval — all changes are staged
- NEVER dismiss feedback without a rationale
- Cluster before fixing — systemic fixes are better than point fixes
- If fixing creates a conflict with another comment, flag it immediately
- Draft responses must be professional — no defensiveness

## Composition
- **Called by**: standalone via keyword
- **Calls**: pr-resolver (triage), executor (fixes), verify (validation), git-ops (commit after approval)
- **Feeds into**: git-ops (commit and push after user approves)
