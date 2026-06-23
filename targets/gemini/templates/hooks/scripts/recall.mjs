#!/usr/bin/env node
/**
 * recall.mjs — GIRA BeforeAgent hook. Port of IRA's IraRecall (v5) to Gemini CLI.
 *
 * Project-scoped semantic recall: GET the local ira-memory API (:7775) with the current cwd in
 * the X-Cwd header so the server BOOSTS facts from the project you're in (same backend + behavior
 * as IRA on Claude). Over-fetch 15, show the best 5 as injected context.
 *
 * Local-only + fail-open: never fires against a non-local endpoint, and any error → clean exit 0
 * with no output, so it can never break a prompt.
 */
import { readFileSync } from 'node:fs';

const BASE = (process.env.IRA_MEMORY_URL || 'http://127.0.0.1:7775').replace(/\/$/, '');

function isLocal(url) {
  try { const h = new URL(url).hostname; return h === '127.0.0.1' || h === 'localhost' || h === '::1'; }
  catch { return false; }
}

async function main() {
  if (!isLocal(BASE) && process.env.IRA_ALLOW_REMOTE_MEMORY !== '1') process.exit(0);

  let prompt = '', cwd = '';
  try {
    const data = JSON.parse(readFileSync('/dev/stdin', 'utf-8') || '{}');
    prompt = (data.prompt || '').toString().trim();
    // Gemini CLI uses `cwd`; Antigravity uses `workspace.current_dir`. Accept both.
    cwd = data.cwd || data.workspace?.current_dir || process.env.GEMINI_PROJECT_DIR || process.cwd();
  } catch { process.exit(0); }

  if (!prompt || prompt.length < 8 || prompt.startsWith('<')) process.exit(0);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2500);
  try {
    const qs = new URLSearchParams({ topic: prompt, limit: '15' });
    const res = await fetch(`${BASE}/memory/recall?${qs}`, {
      headers: cwd ? { 'X-Cwd': cwd } : {},
      signal: ctrl.signal,
    });
    if (!res.ok) process.exit(0);
    const data = await res.json();
    const facts = Array.isArray(data) ? data : (data.facts || data.memories || []);
    if (!facts.length) process.exit(0);

    let out = '\n[GIRA MEMORY — relevant recall]\n';
    for (const f of facts.slice(0, 5)) {
      const content = String(f.content ?? '').replace(/\s+/g, ' ').trim().slice(0, 220);
      if (!content) continue;
      const tag = String(f.category ?? f.type ?? 'memory');
      out += `- [${tag}] ${content}\n`;
    }
    console.log(JSON.stringify({ additionalContext: out }));
  } catch {
    /* fail-open */
  } finally {
    clearTimeout(timer);
  }
  process.exit(0);
}
main();
