---
name: anti-slop
description: USE WHEN implementation is complete and code needs cleanup before verification. Removes AI-generated cruft without changing behavior.
layer: enhancement
level: 4
---

# Anti-Slop

## What This Skill Does
Anti-slop is a post-implementation cleanup pass that removes common AI code generation artifacts. It strips unnecessary verbosity while preserving all logic and behavior. The goal is code that reads like a human wrote it.

## When to Use
- Mandatory before ralph's final verification
- After any substantial implementation by build skill
- Before committing AI-generated code
- When reviewing existing code that feels over-engineered

## How It Works

### Step 1: Identify Changed Files
1. Collect all files modified during the current task
2. For each file, load the current content
3. If a git diff is available, focus on changed regions

### Step 2: Slop Detection Scan
Scan for and flag these patterns:

**Unnecessary Comments**
- Comments that restate what the code already says: `// increment counter` above `counter++`
- Section dividers that add no information: `// ========== HELPERS ==========`
- TODO comments for things being done right now
- Comments explaining obvious standard library usage

**Verbose Logging**
- Console.log statements used for debugging that are not part of the feature
- Excessive error logging that duplicates stack traces
- Log statements that print variable names redundantly: `console.log('user:', user)`

**Dead Code**
- Commented-out code blocks
- Functions that are defined but never called within the changeset
- Imports that are not used
- Variables assigned but never read

**Over-Engineering**
- Abstractions used by exactly one caller — inline them
- Factory functions that create one type — use direct construction
- Config objects for values that never change — use constants
- Wrapper functions that add no logic — remove the indirection
- Premature interface definitions with single implementations
- Feature flags for one-time operations

**AI Tells**
- Overly defensive null checks where the type system guarantees non-null
- Redundant type assertions in TypeScript where inference works
- Try-catch blocks that just re-throw without transformation
- Empty else branches
- Unnecessary async/await on synchronous operations

### Step 3: Cleanup Execution
```
FOR each flagged pattern:
  1. Confirm removal will not change behavior
  2. Remove or simplify the code
  3. Track the change in a diff log
```

### Step 4: Diff Review
1. Generate a unified diff of all anti-slop changes
2. Present the diff for review (to ralph, verifier, or user)
3. Each change must be categorized: comment removal, dead code, simplification, etc.
4. Reject any change that altered logic — anti-slop is cosmetic only

### Hard Rules
- NEVER change function signatures
- NEVER change return values
- NEVER change conditional logic
- NEVER remove error handling that catches real errors
- NEVER remove logging that is part of the feature specification
- NEVER add code — anti-slop only removes or simplifies
- If in doubt, leave it in

## Composition
- **Called by**: ralph (Phase 3, before final verification)
- **Calls**: No other skills — anti-slop is a leaf node
- **Constraint**: Must be followed by a verify pass to confirm nothing broke
