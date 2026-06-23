#!/usr/bin/env node
/**
 * session-capture.mjs — GIRA SessionEnd hook. The write half of memory parity with IRA.
 *
 * Logs the session's conversation to the ira-memory API (:7775) so it's recallable next session
 * (the same store IRA-on-Claude writes to). Gemini's SessionEnd payload differs from Claude's —
 * we read what Gemini provides (transcript / messages / cwd) defensively and POST each turn to
 * /conversation/log with channel "gemini-cli".
 *
 * NOTE: full WORK-ISA transcript seeding (as v5 SessionCapture does on Claude) depends on Gemini's
 * transcript-on-disk format; this hook does the conversation-log half now. Fail-open throughout.
 */
import { readFileSync } from 'node:fs';

const BASE = (process.env.IRA_MEMORY_URL || 'http://127.0.0.1:7775').replace(/\/$/, '');
const CHANNEL = 'gemini-cli';

function isLocal(url) {
  try { const h = new URL(url).hostname; return h === '127.0.0.1' || h === 'localhost' || h === '::1'; }
  catch { return false; }
}

async function logTurn(role, content) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 1500);
  try {
    await fetch(`${BASE}/conversation/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, content, channel: CHANNEL }),
      signal: ctrl.signal,
    });
  } catch { /* fail-open */ } finally { clearTimeout(timer); }
}

async function main() {
  if (!isLocal(BASE) && process.env.IRA_ALLOW_REMOTE_MEMORY !== '1') process.exit(0);
  let data = {};
  try { data = JSON.parse(readFileSync('/dev/stdin', 'utf-8') || '{}'); } catch { process.exit(0); }

  // Gemini may hand us an in-memory messages array, or a transcript path. Handle both shapes.
  let turns = [];
  if (Array.isArray(data.messages)) {
    turns = data.messages;
  } else if (typeof data.transcript_path === 'string') {
    try {
      const raw = readFileSync(data.transcript_path, 'utf-8');
      turns = raw.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    } catch { /* no transcript */ }
  }
  if (!turns.length) process.exit(0);

  for (const t of turns) {
    const role = t.role || t.type;
    const content = typeof t.content === 'string'
      ? t.content
      : Array.isArray(t.content) ? t.content.filter((b) => b?.type === 'text').map((b) => b.text).join('\n') : '';
    if ((role === 'user' || role === 'assistant') && content.trim()) {
      await logTurn(role, content.trim().slice(0, 8000));
    }
  }
  process.exit(0);
}
main();
