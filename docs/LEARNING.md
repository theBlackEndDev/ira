# IRA Learning System

> Continuous improvement through ratings, reflections, and failure analysis.

---

## The Learning Loop

```
Session Work → Rating (1-10) → Reflection → Pattern Synthesis → Future Improvement
                             → Failure Dump (if 1-3)
```

Every session contributes to IRA's understanding of what works and what doesn't.

---

## Ratings

After completing complex work, IRA asks for a rating (1-10):

| Rating | Meaning | Action |
|--------|---------|--------|
| 9-10 | Excellent — Euphoric surprise | Capture what went right |
| 7-8 | Good — Met expectations | Note any minor issues |
| 5-6 | Adequate — Got it done | Identify improvement areas |
| 3-4 | Poor — Significant issues | Full failure analysis |
| 1-2 | Failure — Wrong direction | Emergency context dump |

Ratings are stored in `.ira/learning/signals/`.

---

## Reflections

After each Algorithm execution, a structured JSONL entry is appended to `.ira/learning/reflections/algorithm-reflections.jsonl`:

```json
{
  "timestamp": "2026-04-02T18:00:00-04:00",
  "effort_level": "deep",
  "task_description": "Build auth system with tests",
  "criteria_count": 24,
  "criteria_passed": 24,
  "criteria_failed": 0,
  "implied_sentiment": 8,
  "reflection_q1": "Should have started with the database schema",
  "reflection_q2": "A smarter approach would parallelize test writing with implementation",
  "reflection_q3": "Council skill would have helped with the session strategy decision",
  "within_budget": true
}
```

---

## Failure Analysis

Ratings 1-3 trigger a full context dump to `.ira/learning/failures/`:

```
failures/
  2026-04-02_auth-system-failure/
    context.md      — What was asked, what was delivered
    transcript.md   — Key conversation excerpts
    root-cause.md   — Why it went wrong
    prevention.md   — How to prevent next time
```

---

## Pattern Synthesis

Periodically, accumulated learnings are synthesized into patterns:

- **Common failure modes** — What goes wrong most often
- **Successful patterns** — What approaches consistently work
- **Skill usage** — Which skills are underutilized
- **Agent effectiveness** — Which agents produce best results

Synthesis stored in `.ira/learning/synthesis/`.

---

## How Learnings Inform Future Sessions

1. **SessionStart hook** loads recent learning signals
2. High-frequency failure patterns are injected as warnings
3. Successful patterns are reinforced in skill selection
4. Agent routing adjusts based on historical effectiveness
