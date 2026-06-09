/**
 * ira-memory.ts — Non-blocking HTTP client for the ira-memory API (v5 / Bun).
 *
 * IRA keeps its proven local pgvector recall (ira-memory) as the "find that thing" layer,
 * called over HTTP — NOT via MCP-from-hooks (hooks are plain processes; MCP tools are for the
 * Claude tool loop). Every function is fire-and-forget or returns a safe default; NONE throw,
 * so an unreachable memory service never breaks a session.
 *
 * Endpoint defaults to the LOCAL service. recall embeds queries via the operator's LOCAL LLM,
 * so there is no metered/paid call — enforced by assertLocal() (ISC-2.6).
 */

const BASE = (process.env.IRA_MEMORY_URL || 'http://127.0.0.1:7775').replace(/\/$/, '');
const FAST_MS = 600;     // logging / kv / entity
const RECALL_MS = 2500;  // semantic recall may run a local embedding

function debugLog(...args: unknown[]) {
  if (process.env.IRA_HOOK_DEBUG === '1') console.error(...args);
}

/**
 * ISC-2.6 — refuse a non-local endpoint unless explicitly allowed. Local embeddings are free;
 * a remote OpenAI-compatible endpoint could be metered. No silent paid fires.
 */
export function assertLocal(): void {
  let host = '';
  try { host = new URL(BASE).hostname; } catch { host = ''; }
  const local = host === '127.0.0.1' || host === 'localhost' || host === '::1';
  if (!local && process.env.IRA_ALLOW_REMOTE_MEMORY !== '1') {
    throw new Error(
      `[ira-memory] refusing non-local endpoint ${BASE} — recall embeddings may be metered. ` +
      `Set IRA_ALLOW_REMOTE_MEMORY=1 to override.`,
    );
  }
}

async function call(path: string, init: RequestInit, timeoutMs: number): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${BASE}${path}`, { ...init, signal: controller.signal });
  } catch (err) {
    debugLog(`[ira-memory] ${path} failed:`, (err as Error)?.message || err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function health(): Promise<{ status: string; backend?: string; port?: number } | null> {
  const res = await call('/health', {}, FAST_MS);
  if (!res?.ok) return null;
  try { return await res.json(); } catch { return null; }
}

export interface LogOpts {
  role: string; content: string; channel?: string;
  sessionId?: string; turnId?: string; transcriptPath?: string;
}
/** POST /conversation/log — fire-and-forget. */
export async function logConversation(o: LogOpts): Promise<void> {
  assertLocal();
  const body: Record<string, unknown> = { role: o.role, content: o.content, channel: o.channel ?? 'claude-code' };
  if (o.sessionId) body.sessionId = o.sessionId;
  if (o.turnId) body.turnId = o.turnId;
  if (o.transcriptPath) body.transcriptPath = o.transcriptPath;
  await call('/conversation/log', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }, FAST_MS);
}

/** GET /conversation/recent — [] on error. */
export async function recallRecentConversations({ channel, limit = 20 }: { channel?: string; limit?: number } = {}): Promise<unknown[]> {
  const p = new URLSearchParams();
  if (channel) p.set('channel', channel);
  p.set('limit', String(limit));
  const res = await call(`/conversation/recent?${p}`, {}, FAST_MS);
  if (!res?.ok) return [];
  try {
    const d = await res.json();
    return Array.isArray(d) ? d : (Array.isArray(d?.messages) ? d.messages : []);
  } catch { return []; }
}

/** GET /memory/recall — semantic + structured. [] on error. LOCAL embedding (free). */
export async function recallMemory({ topic, limit = 5 }: { topic: string; limit?: number }): Promise<unknown[]> {
  if (!topic) return [];
  assertLocal();
  const p = new URLSearchParams({ topic, limit: String(limit) });
  const res = await call(`/memory/recall?${p}`, {}, RECALL_MS);
  if (!res?.ok) return [];
  try {
    const d = await res.json();
    if (Array.isArray(d)) return d;
    if (Array.isArray(d?.facts)) return d.facts;
    if (Array.isArray(d?.memories)) return d.memories;
    return [];
  } catch { return []; }
}

/** GET /entity/search — parity with ira_entity_search. [] on error. */
export async function entitySearch(q: string, limit = 10): Promise<unknown[]> {
  if (!q) return [];
  const res = await call(`/entity/search?${new URLSearchParams({ q, limit: String(limit) })}`, {}, FAST_MS);
  if (!res?.ok) return [];
  try {
    const d = await res.json();
    return Array.isArray(d) ? d : (Array.isArray(d?.entities) ? d.entities : []);
  } catch { return []; }
}

/** GET/PUT/DELETE /kv/<key> — scratch key-value parity. */
export async function kvGet(key: string): Promise<unknown> {
  const res = await call(`/kv/${encodeURIComponent(key)}`, {}, FAST_MS);
  if (!res?.ok) return null;
  try { return await res.json(); } catch { return null; }
}
export async function kvSet(key: string, value: unknown): Promise<boolean> {
  const res = await call(`/kv/${encodeURIComponent(key)}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value }),
  }, FAST_MS);
  return !!res?.ok;
}
export async function kvDelete(key: string): Promise<boolean> {
  const res = await call(`/kv/${encodeURIComponent(key)}`, { method: 'DELETE' }, FAST_MS);
  return !!res?.ok;
}

// ── self-test CLI ────────────────────────────────────────────────────────────
if (process.argv[1] && process.argv[1].includes('ira-memory')) {
  (async () => {
    console.log(`endpoint: ${BASE}`);
    try { assertLocal(); console.log('local-only guard: PASS'); } catch (e) { console.log('local-only guard:', (e as Error).message); }
    const h = await health();
    console.log('health:', h ? JSON.stringify(h) : 'UNREACHABLE');
    const facts = await recallMemory({ topic: 'memory recall binding port', limit: 3 });
    console.log(`recallMemory: ${facts.length} result(s)`);
    if (facts[0]) console.log('  top:', JSON.stringify(facts[0]).slice(0, 160));
    const conv = await recallRecentConversations({ limit: 2 });
    console.log(`recallRecentConversations: ${conv.length} message(s)`);
    const k = `__ira_selftest_${Date.now()}`;
    const set = await kvSet(k, { ok: true });
    const got = await kvGet(k);
    await kvDelete(k);
    console.log(`kv roundtrip: set=${set} got=${got ? 'ok' : 'n/a'}`);
    console.log('self-test done');
  })();
}
