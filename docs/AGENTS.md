# IRA Agent Reference

> 19 specialized agents with static model routing and enforced role boundaries.

---

## Agent Roster

### Tier 1 — Haiku (Fast, Simple Tasks)

| Agent | Purpose | Key Constraint |
|-------|---------|---------------|
| **scout** | Quick file lookups, existence checks, simple grep | No implementation, no analysis |
| **formatter** | Code formatting, linting fixes, import sorting | No logic changes, formatting only |
| **explorer** | Codebase navigation, architecture mapping | Read-only exploration |

### Tier 2 — Sonnet (Standard Implementation)

| Agent | Purpose | Key Constraint |
|-------|---------|---------------|
| **executor** | Primary implementation — writes code | No architecture decisions |
| **debugger** | Bug isolation, root cause, fix | One change at a time |
| **test-engineer** | Test writing, coverage analysis | Does not fix failing tests |
| **designer** | UI/UX implementation, accessibility | Follows design specs, doesn't create them |
| **content-writer** | Documentation, README, blog posts | Technical accuracy required |
| **social-ops** | Social media content, scheduling | Platform-appropriate formatting |
| **git-ops** | Git operations, PRs, commits | No code changes, only git operations |
| **security-reviewer** | Vulnerability scanning, OWASP | Reports issues, doesn't fix them |
| **code-reviewer** | Quality review, patterns | Suggests changes, doesn't implement |

### Tier 3 — Opus (Deep Reasoning)

| Agent | Purpose | Key Constraint |
|-------|---------|---------------|
| **architect** | System design, API design | **READ-ONLY** — does not write code |
| **analyst** | Requirements decomposition, ISC generation | Analysis only, no implementation |
| **critic** | Plan validation, adversarial review | **READ-ONLY** — does not create plans |
| **brand-strategist** | Brand positioning, marketing strategy | Strategy only, no execution |
| **scientist** | Hypothesis testing, experiment design | Designs experiments, doesn't run them |
| **planner** | Implementation planning, sequencing | Plans only, does not implement |
| **verifier** | Acceptance verification, evidence | Verifies against ISC, requires proof |

---

## Role Boundaries

**Strictly enforced by the boundary-enforcer hook:**

- architect + critic: `disallowedTools: ["Write", "Edit"]`
- executor: Must NOT make architecture decisions — escalate to architect
- Author ≠ Reviewer: The implementing agent never verifies its own work

---

## Agent Definition Format

Each agent lives at `agents/{name}.md` with:

```yaml
---
name: agent-name
description: One-line description
model: claude-haiku-4-5 | claude-sonnet-4-6 | claude-opus-4-6
tier: 1 | 2 | 3
disallowedTools: []
---
```

Followed by an XML prompt body with: Role, Why_This_Matters, Success_Criteria, Constraints, Tool_Usage, Output_Format, Failure_Modes, Final_Checklist.

---

## Adding Custom Agents

Create a new `.md` file in `agents/` following the format above. The agent is automatically available via the Agent tool.

Custom agents should:
1. Have a clear, non-overlapping role
2. Specify their model tier
3. Define explicit constraints
4. List failure modes to avoid
