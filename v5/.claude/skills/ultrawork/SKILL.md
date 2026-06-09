---
name: ultrawork
description: USE WHEN multiple independent tasks can run in parallel. Classifies dependencies and fires concurrent agents.
layer: enhancement
level: 5
---

# Ultrawork

## What This Skill Does
Ultrawork maximizes throughput by identifying independent tasks and running them simultaneously via child agents. It handles dependency ordering, agent tier routing, and result aggregation.

## When to Use
- Activated by ralph automatically for all guaranteed-completion tasks
- Any task with 3+ subtasks where at least 2 are independent
- Research tasks needing multiple codebase searches
- Refactoring across multiple unrelated files
- Build + test + lint operations that can overlap

## How It Works

### Step 1: Task Decomposition
1. Receive task list (from ralph, build, or direct request)
2. For each task, identify:
   - Input dependencies (what files/data it reads)
   - Output targets (what files/data it writes)
   - Execution requirements (tools, permissions, network)

### Step 2: Dependency Graph
1. Build a DAG of tasks based on input/output overlap
2. Tasks with no shared outputs are independent — can run in parallel
3. Tasks where one's output is another's input are sequential — order them
4. Tasks writing to the same file are conflicting — serialize them

### Step 3: Agent Tier Routing
Route each task to the appropriate agent tier:
- **Haiku**: File reads, grep searches, simple file writes, formatting, linting
- **Sonnet**: Standard implementation, test writing, refactoring, debugging
- **Opus**: Architecture decisions, complex logic, security-sensitive code, design review

### Step 4: Parallel Dispatch
```
WHILE tasks remain:
  1. Identify all tasks whose dependencies are satisfied
  2. Cap concurrent agents at 6
  3. Fire independent tasks simultaneously via Agent tool
  4. For long operations (builds, test suites): use background execution
  5. Collect results as agents complete
  6. Mark completed task outputs as available for dependents
  7. If any agent fails: log error, decide retry vs skip based on criticality
```

### Step 5: Result Aggregation
1. Collect all agent outputs
2. Check for conflicts (two agents modified the same file unexpectedly)
3. If conflicts exist: use the higher-tier agent's output, flag for review
4. Merge results into unified output
5. Report: tasks completed, tasks failed, wall-clock time saved vs serial execution

### Concurrency Rules
- Never exceed 6 concurrent child agents
- Never run two agents writing to the same file simultaneously
- Background builds/tests do not count toward the 6-agent cap
- If an agent hangs beyond 5 minutes with no output, terminate and retry once

### Failure Handling
- Single agent failure: retry once, then mark task as failed and continue
- Multiple agent failures (3+): halt, report failures, ask for guidance
- Dependency chain failure: skip all downstream tasks, report the chain

## Composition
- **Called by**: ralph (always), build (for multi-file work), research (for multi-angle investigation)
- **Calls**: Agent tool for child agent dispatch
- **Layers with**: Any execution skill — ultrawork is a parallelization wrapper, not an executor
