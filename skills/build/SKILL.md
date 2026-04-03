---
name: build
description: USE WHEN implementing code changes — new features, bug fixes, refactoring. Primary execution skill for all coding work.
layer: execution
level: 5
---

# Build

## What This Skill Does
Build is the primary execution skill for all coding tasks. It handles implementation from single-file changes to multi-component features, routing work to the appropriate agent tier and generating test requirements based on task complexity.

## When to Use
- Any task that requires writing or modifying code
- Bug fixes with known root cause
- Feature implementation from specs or requirements
- Refactoring with clear scope
- Auto-activated by ralph during implementation phases

## How It Works

### Step 1: Scope Assessment
1. Analyze the task to determine:
   - Files to be created or modified
   - External dependencies or APIs involved
   - Risk level (low: cosmetic, medium: logic changes, high: data/security/infrastructure)
   - Estimated complexity (trivial, standard, complex, architectural)

### Step 2: Agent Routing
Based on scope assessment, route work:
- **Sonnet tier** (standard work):
  - Implementing well-defined features from specs
  - Writing tests from existing code
  - Refactoring with clear before/after
  - Bug fixes with known cause and solution
  - CRUD operations, UI components, utility functions
- **Opus tier** (design decisions):
  - Architecture choices affecting multiple modules
  - Security-sensitive implementations (auth, crypto, input validation)
  - Performance-critical code paths
  - Complex state management or concurrency logic
  - API design that will be consumed by external systems

### Step 3: ISC Generation
Generate Implementation Success Criteria based on complexity:

**Trivial** (1-2 criteria):
- The change compiles/runs without errors
- The specific behavior requested is present

**Standard** (3-5 criteria):
- All trivial criteria
- Unit tests pass for changed logic
- No regressions in related tests
- Edge cases identified and handled

**Complex** (5-8 criteria):
- All standard criteria
- Integration tests cover cross-component interactions
- Error handling covers failure modes
- Performance characteristics are acceptable (no N+1 queries, no blocking calls)

**Architectural** (8+ criteria):
- All complex criteria
- Design document or ADR created
- Migration path defined if changing existing interfaces
- Rollback strategy identified
- E2E tests cover critical user flows

### Step 4: Implementation
```
1. Read all relevant existing code for context
2. Plan changes before writing — identify all touch points
3. Implement changes file by file:
   a. Make the change
   b. Verify syntax (save, check for errors)
   c. Run related tests if they exist
4. Write new tests as required by ISC:
   - Unit tests: for pure logic, transformations, calculations
   - Integration tests: for API endpoints, database operations, service interactions
   - E2E tests: for user-facing flows (Playwright for web, Maestro for Expo mobile)
5. Run full test suite for affected modules
6. Self-review: re-read all changes, check for consistency
```

### Step 5: Handoff
1. If called by ralph: return ISC evidence map to ralph for verify phase
2. If standalone: run verify skill on generated ISC criteria
3. Report: files changed, tests added/modified, ISC criteria status

### Implementation Rules
- Read before writing — always understand existing code patterns first
- Match existing code style — do not introduce new formatting conventions
- One concern per function — if a function does two things, split it
- Error messages must be actionable — include what went wrong and what to do
- No hardcoded values that should be configurable
- No placeholder implementations — every function must be complete or explicitly marked as a stub with a tracking issue

## Composition
- **Called by**: ralph (implementation phase), plan (for proof-of-concept work)
- **Calls**: ultrawork (for multi-file parallel implementation), verify (post-implementation)
- **Layers with**: anti-slop (cleanup after implementation), git-ops (commit after verification)
