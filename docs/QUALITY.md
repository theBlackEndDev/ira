# IRA Quality System

> ISC criteria, the Splitting Test, and verification methodology.

---

## Ideal State Criteria (ISC)

Every non-trivial task is decomposed into ISC — atomic, binary-testable statements of what "done" looks like.

### Format

```markdown
- [ ] ISC-1: Landing page hero section renders correctly
- [ ] ISC-2: API returns 200 with valid auth token
- [ ] ISC-A-1: Anti: No credentials in source code
```

### Rules

- **8-12 words** per criterion
- **End-state, not action** — "Tests pass" not "Run tests"
- **Binary testable** — True or false, no judgment needed
- **Atomic** — One verifiable thing per criterion
- **Anti-criteria** (ISC-A-*) define what must NOT happen

### ISC Count by Complexity

| Complexity | ISC Floor | When |
|------------|-----------|------|
| Simple | 0 | Quick fixes, Q&A |
| Standard | 8 | Feature work, multi-file changes |
| Deep | 24 | Architecture, refactors |
| Comprehensive | 64 | Full builds, major systems |

---

## The Splitting Test

Apply to EVERY criterion before finalizing:

### 1. "And/With" Test
If the criterion contains "and", "with", "including" joining two verifiable things → **split**.

Bad: `ISC-1: Login form validates email and password`
Good: `ISC-1: Login form validates email format` + `ISC-2: Login form validates password length`

### 2. Independent Failure Test
Can part A pass while part B fails? → **Split**.

Bad: `ISC-1: API returns correct data with proper headers`
Good: `ISC-1: API returns correct data structure` + `ISC-2: API response includes CORS headers`

### 3. Scope Word Test
Contains "all", "every", "complete"? → **Enumerate** what that means.

Bad: `ISC-1: All tests pass`
Good: `ISC-1: Auth tests pass (14 tests)` + `ISC-2: API tests pass (8 tests)` + `ISC-3: E2E tests pass (5 tests)`

### 4. Domain Boundary Test
Crosses UI/API/data/logic boundaries? → **One per domain**.

Bad: `ISC-1: User can create account with email verification`
Good: `ISC-1: Registration API accepts email+password` + `ISC-2: Verification email sends via Listmonk` + `ISC-3: UI shows confirmation message`

---

## Verification

Every ISC criterion requires evidence before checking:

| Evidence Type | When to Use |
|---------------|-------------|
| Test output | Automated tests pass |
| Curl/API response | API endpoints work |
| Screenshot | Visual verification |
| Grep output | Content exists/doesn't exist |
| File content | Configuration correct |
| Build output | Compilation succeeds |

**"I checked and it works" is NOT evidence.** Show the output.

---

## Reviewer Separation

For Deep+ complexity:
- The agent that implements is NOT the agent that verifies
- Implementation: executor (Sonnet)
- Verification: verifier (Opus)
- The verifier checks against ISC criteria with fresh evidence

---

## Anti-Slop Pass

Before final verification on any implementation task:
1. Review all modified files for AI-generated cruft
2. Remove: unnecessary comments, verbose logging, dead code, unused imports
3. Remove: over-engineering, premature abstractions
4. Verify: no behavior changes from cleanup
5. Run tests after cleanup to confirm
