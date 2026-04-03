---
name: council
description: USE WHEN facing decisions with multiple valid options — technology choices, architecture tradeoffs, strategy questions. Multi-perspective debate.
layer: execution
level: 5
---

# Council

## What This Skill Does
Council spawns four agents with distinct perspectives to debate a decision. Each agent argues independently, then a moderator synthesizes the debate into a consensus recommendation with dissenting opinions noted.

## When to Use
- Choosing between competing technologies or libraries
- Architecture decisions with significant long-term impact
- Strategy questions with no obviously correct answer
- When plan skill's critic and architect disagree
- Any decision where you want to stress-test an approach before committing

## How It Works

### Step 1: Frame the Decision
1. State the decision clearly: "Should we X or Y?" or "How should we approach Z?"
2. List known constraints and context
3. Identify the evaluation criteria that matter (performance, maintainability, time-to-ship, etc.)
4. Distribute the brief to all four perspective agents

### Step 2: Perspective Assignment
Each agent gets a fixed perspective they must argue from:

**Pragmatist**
- Optimizes for shipping speed and simplicity
- Asks: "What is the fastest path to working software?"
- Prefers proven, boring technology over novel solutions
- Values: time-to-market, team familiarity, operational simplicity
- Bias: against complexity, over-engineering, premature optimization

**Innovator**
- Optimizes for technical excellence and future capability
- Asks: "What gives us the best foundation for the next 2 years?"
- Willing to invest upfront for long-term payoff
- Values: extensibility, performance ceiling, developer experience
- Bias: toward new approaches, sometimes underestimates migration cost

**Skeptic**
- Optimizes for risk reduction and failure resilience
- Asks: "What can go wrong and how bad is it?"
- Stress-tests every assumption, finds edge cases
- Values: reliability, rollback capability, graceful degradation
- Bias: toward caution, sometimes overly conservative

**User Advocate**
- Optimizes for end-user experience and impact
- Asks: "How does this affect the person using the product?"
- Measures everything by user-facing outcomes
- Values: responsiveness, correctness, accessibility, simplicity of mental model
- Bias: toward user-visible improvements, sometimes ignores infrastructure needs

### Step 3: Independent Arguments
```
FOR each perspective agent (in parallel via ultrawork):
  1. Agent receives the decision brief and their assigned perspective
  2. Agent produces a structured argument:
     - Position: their recommended choice
     - Reasoning: 3-5 points supporting their position
     - Risks: what could go wrong with their recommendation
     - Counter-arguments: why the other options are worse
     - Conditions: under what circumstances they would change their mind
  3. Time budget: 3 minutes per agent
```

### Step 4: Cross-Examination
1. Each agent reads all other agents' arguments
2. Each agent produces a brief rebuttal (2-3 points):
   - Where they agree with another perspective
   - Where they disagree and why
   - Any new information or angle raised by others

### Step 5: Moderation and Synthesis
The moderator (primary agent) synthesizes:
1. Identify points of consensus — where all or most perspectives agree
2. Identify key disagreements — where perspectives fundamentally conflict
3. Weight the perspectives based on the evaluation criteria from Step 1
4. Produce the recommendation:

```
## Council Decision

### Question
[The decision that was debated]

### Consensus Points
[What all perspectives agreed on]

### Recommendation
[The synthesized recommendation with rationale]

### Key Tradeoffs
[What is being sacrificed and why it is acceptable]

### Dissenting Views
[Perspectives that disagreed with the recommendation, and their reasoning]

### Decision Conditions
[Under what circumstances this decision should be revisited]
```

### Council Rules
- Perspectives must be genuinely argued — no strawman positions
- Each agent must engage with the actual question, not abstract principles
- Rebuttals must address specific claims, not general sentiments
- The moderator must note genuine dissent, not paper over disagreements
- If the council is split 2-2 with strong arguments on both sides, present both options to the user rather than forcing a weak consensus

## Composition
- **Called by**: plan (when architect and critic disagree), ralph (for mid-implementation pivots)
- **Calls**: ultrawork (for parallel perspective agents), research (if agents need factual information)
- **Feeds into**: plan (council recommendation becomes a constraint for planning)
