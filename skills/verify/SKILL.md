---
name: verify
description: USE WHEN implementation is complete and success criteria need evidence-based verification. Rejects claims without proof.
layer: guarantee
level: 5
---

# Verify

## What This Skill Does
Verify checks every ISC criterion against concrete, reproducible evidence. It treats unverified claims as failures. "I checked and it works" is never accepted as evidence.

## When to Use
- Auto-activated on Deep+ complexity tasks after implementation
- Called by ralph after each implementation iteration
- Manually invoked when you need to confirm a change actually works
- Before any PR or commit on critical paths

## How It Works

### Step 1: Criteria Intake
1. Receive ISC criteria list (from ralph PRD, task description, or generate from context)
2. For each criterion, determine the required evidence type:
   - **Test output**: Run the test, capture stdout/stderr and exit code
   - **File content**: Read the file, grep for expected content
   - **Build success**: Run build command, capture exit code and output
   - **Runtime behavior**: Execute the code path, capture output or screenshot
   - **Grep results**: Search codebase for expected patterns or absence of patterns

### Step 2: Evidence Collection
```
FOR each criterion:
  1. Determine the verification command or check
  2. Execute the check
  3. Capture raw output as evidence
  4. Evaluate: does the evidence satisfy the criterion? (binary yes/no)
  5. Record: { criterion, evidence_type, raw_output, verdict }
```

### Step 3: Evidence Evaluation Rules
- Exit code 0 from a test suite is evidence ONLY if the test actually covers the criterion
- A file existing is not evidence it has correct content — read and verify content
- A build passing is not evidence features work — it is evidence of no syntax/type errors
- Console output saying "success" from your own code is not independent evidence
- Grep finding expected code is evidence of implementation, not of behavior

### Step 4: Report
Output an evidence table:
```
| Criterion | Evidence Type | Verdict | Detail |
|-----------|--------------|---------|--------|
| ...       | ...          | PASS/FAIL | [raw output excerpt] |
```

### Step 5: Failure Handling
- For each FAIL: explain what evidence was expected vs what was found
- Suggest specific remediation steps
- Return failure list to caller (ralph or direct user)

### Rejected Evidence Patterns
These are NEVER accepted as verification:
- "I looked at the code and it's correct"
- "The function is implemented so it should work"
- "I checked and it works" without showing what was checked
- "The tests pass" without showing test output
- "The file was created" without showing its contents match expectations

## Composition
- **Called by**: ralph (after each iteration), build (post-implementation)
- **Calls**: No other skills — verify is a leaf node
- **Independence**: Verify must not modify any files — it is read-only and execute-only
