# IRA Automation System

> Actions, Pipelines, and Flows — composable automation primitives.

---

## The Primitive Hierarchy

Inspired by UNIX philosophy: do one thing well, compose through standard interfaces.

```
Action (A_)  → Single unit of work. JSON in, JSON out.
Pipeline (P_) → Chains actions sequentially. Output N → Input N+1.
Flow (F_)    → Source → Pipeline → Destination, on a schedule.
```

---

## Actions

Atomic work units. Each action:
- Takes JSON input
- Produces JSON output
- Does one thing
- Runs identically local (Bun) or cloud (Cloudflare Workers)

```typescript
// A_SCORE_IDEA
interface Input { name: string; description: string; }
interface Output { score: number; reasons: string[]; recommendation: string; }

export async function execute(input: Input, capabilities: Capabilities): Promise<Output> {
  const analysis = await capabilities.llm(systemPrompt, JSON.stringify(input));
  return JSON.parse(analysis);
}
```

### Capabilities

Actions receive capabilities (not imports):
- `llm` — AI inference (routes through OpenClaw gateway)
- `shell` — Command execution
- `readFile` / `writeFile` — File I/O
- `fetch` — HTTP requests

---

## Pipelines

Chain actions in sequence using the pipe model:

```
Input → A_PARSE → A_ENRICH → A_FORMAT → A_SEND → Output
```

Each action receives all upstream fields via passthrough:
```typescript
const { content, ...upstream } = input;
const enriched = await enrich(content);
return { ...upstream, content: enriched, enrichedAt: new Date() };
```

---

## Flows

Connect external sources to pipelines on a schedule:

```
RSS Feed → (every 30 min) → P_PROCESS_ARTICLE → Email
Forge DB → (daily 6 AM) → P_CHECK_DEPLOYED → Refinery Intake
Plausible → (weekly Sunday) → P_ANALYTICS_REPORT → Discord
```

Flows run as cron jobs (local via Bun cron, or cloud via Cloudflare Workers).

---

## Integration with The Trilogy

| Flow | Source | Pipeline | Destination |
|------|--------|----------|-------------|
| Forge → Refinery | Forge DB (deployed apps) | P_INTAKE_PRODUCT | Refinery brand pipeline |
| Foundry → Social | Foundry (approved content) | P_SCHEDULE_CONTENT | Postiz |
| Refinery → Forge | Refinery (analytics) | P_FEEDBACK_SCORES | Forge scoring |
| RSS → Newsletter | RSS feeds | P_NEWS_ROUNDUP | Listmonk |
