/**
 * ira-memory.mjs — Non-blocking HTTP client for the ira-memory API.
 *
 * All functions are fire-and-forget or return safe defaults on any error.
 * They MUST NEVER throw — hooks that call these must not break user sessions
 * because the memory API is unreachable or returns an error.
 *
 * API runs at http://127.0.0.1:7775 (see CLAUDE.md memory section).
 *
 * Channel convention (matches existing Discord/Telegram naming from CLAUDE.md):
 *   target === "claude"  → channel "claude-code"
 *   target === "codex"   → channel "codex"
 */

const BASE = 'http://127.0.0.1:7775';

/** Timeout in ms for all API calls. */
const TIMEOUT_MS = 500;

/**
 * POST /conversation/log
 *
 * Fire-and-forget. Never throws. Silently fails if API is down.
 * The caller should use:  void logConversation(...).catch(() => {});
 *
 * @param {{ role: string, content: string, channel: string, sessionId?: string, turnId?: string, transcriptPath?: string }} opts
 * @returns {Promise<void>}
 */
export async function logConversation({ role, content, channel, sessionId, turnId, transcriptPath }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const body = { role, content, channel };
    if (sessionId) body.sessionId = sessionId;
    if (turnId) body.turnId = turnId;
    if (transcriptPath) body.transcriptPath = transcriptPath;

    await fetch(`${BASE}/conversation/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    // Non-fatal. Log to stderr so hook output (stdout) stays clean.
    console.error('[ira-memory] logConversation failed:', err?.message || err);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GET /conversation/recent?channel=...&limit=N
 *
 * Returns [] on any error.
 *
 * @param {{ channel?: string, limit?: number }} opts
 * @returns {Promise<Array>}
 */
export async function recallRecentConversations({ channel, limit = 20 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const params = new URLSearchParams();
    if (channel) params.set('channel', channel);
    params.set('limit', String(limit));

    const res = await fetch(`${BASE}/conversation/recent?${params}`, {
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : (Array.isArray(data?.messages) ? data.messages : []);
  } catch (err) {
    console.error('[ira-memory] recallRecentConversations failed:', err?.message || err);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GET /memory/recall?topic=...
 *
 * Semantic + structured recall. Returns [] on any error.
 *
 * @param {{ topic: string, limit?: number }} opts
 * @returns {Promise<Array>}
 */
export async function recallMemory({ topic, limit = 5 } = {}) {
  if (!topic) return [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const params = new URLSearchParams({ topic, limit: String(limit) });
    const res = await fetch(`${BASE}/memory/recall?${params}`, {
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const data = await res.json();
    // ira-memory /memory/recall returns { facts: [...], summaries: [...] }
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.facts)) return data.facts;
    if (Array.isArray(data?.memories)) return data.memories;
    return [];
  } catch (err) {
    console.error('[ira-memory] recallMemory failed:', err?.message || err);
    return [];
  } finally {
    clearTimeout(timer);
  }
}
