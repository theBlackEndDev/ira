---
name: research
description: USE WHEN investigating unknowns — technology choices, bug root causes, codebase understanding, API exploration. Spawns parallel research agents.
layer: execution
level: 4
---

# Research

## What This Skill Does
Research conducts multi-angle investigations by spawning parallel research agents, each taking a different approach to the question. It synthesizes findings into a unified report with confidence ratings and source references.

## When to Use
- Investigating a bug with unknown root cause
- Evaluating technology or library options
- Understanding unfamiliar codebase areas
- Exploring API capabilities or limitations
- Any question where the answer is not immediately obvious
- Activated by plan skill for requirements gathering

## How It Works

### Step 1: Depth Classification
Classify the research request:

**Quick** (1 agent, ~2 minutes):
- Single factual question with likely one source
- "What does this function do?"
- "Where is X configured?"
- Codebase search for a specific pattern

**Standard** (2 agents, ~5 minutes):
- Comparison between options
- Bug investigation with some clues
- Understanding a module's architecture
- API capability exploration

**Deep** (4 agents, ~15 minutes):
- Technology evaluation with tradeoffs
- Bug with no obvious cause
- Full system architecture mapping
- Cross-cutting concern analysis (security audit, performance profiling)

### Step 2: Angle Assignment
Each agent gets a distinct research angle:

**For bug investigations:**
- Agent 1: Trace the error — follow stack traces, logs, error messages
- Agent 2: Search for similar issues — git blame, issue trackers, forums
- Agent 3: Test the hypothesis — reproduce with minimal case, check edge cases
- Agent 4: Examine the environment — dependencies, config, runtime conditions

**For technology evaluation:**
- Agent 1: Feature comparison — capabilities, limitations, API surface
- Agent 2: Community health — maintenance activity, issue response time, adoption
- Agent 3: Integration assessment — compatibility with existing stack, migration effort
- Agent 4: Risk analysis — licensing, security history, long-term viability

**For codebase understanding:**
- Agent 1: Structure mapping — directory layout, module boundaries, entry points
- Agent 2: Data flow tracing — how data moves through the system
- Agent 3: Dependency analysis — what depends on what, external integrations
- Agent 4: Pattern identification — conventions used, architectural style, test coverage

### Step 3: Parallel Execution
```
1. Spawn agents via ultrawork (or directly if ultrawork is not active)
2. Each agent receives:
   - The research question
   - Their specific angle
   - Time budget
   - Output format requirements
3. Agents work independently — no cross-communication during research
4. Collect results as agents complete
```

### Step 4: Synthesis
1. Deduplicate findings across agents
2. Resolve contradictions — note disagreements with evidence from each side
3. Rate confidence per finding:
   - **High**: multiple agents found consistent evidence
   - **Medium**: single agent found evidence, others did not contradict
   - **Low**: circumstantial evidence only, or agents disagreed
4. Structure final report:
   ```
   ## Question
   [Original research question]

   ## Key Findings
   [Ranked by confidence, 3-7 bullets]

   ## Evidence
   [Source references: file paths, URLs, command outputs]

   ## Unknowns
   [What we could not determine and what would be needed to find out]

   ## Recommendation
   [If the question was a decision, state the recommended path with rationale]
   ```

### Research Rules
- Never present speculation as findings — label uncertainty explicitly
- Always include source references — a finding without a source is an opinion
- Time-box strictly — if an angle is not productive after 40% of budget, pivot
- Prefer primary sources (code, docs, tests) over secondary (blog posts, forums)

## Composition
- **Called by**: plan (for requirements gathering), ralph (when investigation is needed mid-implementation)
- **Calls**: ultrawork (for parallel agent dispatch)
- **Feeds into**: plan (findings inform architecture), build (root cause informs fix), council (findings inform debate)
