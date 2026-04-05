---
name: red-team
description: USE WHEN a plan, decision, or architecture needs adversarial stress-testing. Spawns multiple agents to attack from different angles.
layer: execution
level: 5
---

# Red Team

## What This Skill Does
Red Team spawns three adversarial agents, each attacking a target (plan, architecture, decision, or code) from a different angle. The agents produce structured vulnerability reports that are synthesized into a unified threat model with prioritized action items.

## When to Use
- Before finalizing an architecture or system design
- When a plan seems "too clean" and needs stress-testing
- Before shipping security-sensitive features
- When evaluating infrastructure for scale readiness
- When you need to find edge cases and failure modes before users do

## How It Works

### Step 1: Parse the Target
1. Identify what is being stress-tested: a plan, architecture, decision, or code
2. Gather all relevant context (specs, diagrams, code, constraints)
3. Frame the attack brief: what is the system supposed to do, what are its boundaries

### Step 2: Spawn Adversarial Agents
Three agents attack simultaneously from different angles:

**Security Adversary** (security-reviewer, Sonnet)
- Find vulnerabilities, injection vectors, auth bypasses, data exposure
- Test trust boundaries and input validation
- Check for privilege escalation paths
- Look for information leakage and side-channel attacks

**Scale Adversary** (architect, Opus)
- Find scaling bottlenecks and single points of failure
- Identify resource exhaustion paths (memory, connections, disk, CPU)
- Test behavior under 10x, 100x, 1000x expected load
- Look for cascade failure scenarios and missing backpressure

**User Adversary** (critic, Opus)
- Find UX failures and confusing error states
- Identify edge cases real users will hit (empty states, long strings, concurrent actions)
- Check accessibility gaps and missing feedback loops
- Test unhappy paths: what happens when things go wrong from the user's perspective

### Step 3: Structured Attack Reports
Each agent produces a report with entries in this format:
```
## [Vulnerability Name]

- **Severity**: critical | high | medium | low
- **Category**: security | scale | usability
- **Exploit Scenario**: How this vulnerability is triggered in practice
- **Impact**: What happens when it is exploited
- **Mitigation**: Recommended fix or defense
```

### Step 4: Synthesize Threat Model
1. Collect all vulnerability reports from the three agents
2. Deduplicate overlapping findings
3. Rank by severity: critical items first, then high, medium, low
4. Produce a unified threat model:

```
## Red Team Report

### Critical Findings
[Must-fix before shipping]

### High Findings
[Should-fix before shipping]

### Medium Findings
[Fix in next iteration]

### Low Findings
[Track for future improvement]

### Overall Risk Assessment
[Summary: is this safe to ship? What is the biggest risk?]
```

### Red Team Rules
- Agents must find real vulnerabilities, not theoretical nitpicks
- Every finding must include a concrete exploit scenario
- Severity ratings must be justified by actual impact, not worst-case imagination
- Mitigations must be actionable and specific, not generic advice
- If an agent finds nothing critical, that is a valid outcome — do not manufacture findings

## Composition
- **Called by**: ralph (when adversarial review is needed), plan (to validate architecture)
- **Calls**: verify (to confirm mitigations after fixes are applied)
- **Agents used**: security-reviewer (Sonnet), architect (Opus), critic (Opus)
