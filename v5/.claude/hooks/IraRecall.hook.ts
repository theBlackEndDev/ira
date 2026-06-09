#!/usr/bin/env bun
/**
 * IraRecall.hook.ts — UserPromptSubmit
 *
 * Wires IRA's local pgvector recall (ira-memory :7775) into the session loop over HTTP
 * (ISC-2.3) — NOT via MCP-from-hooks. On each substantive prompt it semantically recalls
 * the most relevant stored facts and injects them as additionalContext, so the model
 * "knows the details" without the user re-describing or pointing at files.
 *
 * Local-only: assertLocal() guarantees no metered/paid embedding fire (ISC-2.6).
 * Fail-open: any error → exit 0 with no output. Never breaks a prompt.
 */
import { recallMemory, assertLocal } from './lib/ira-memory';

async function main() {
  let prompt = '';
  try {
    const raw = await Bun.stdin.text();
    prompt = (JSON.parse(raw || '{}').prompt || '').toString().trim();
  } catch {
    process.exit(0);
  }

  // Skip system text and trivial prompts.
  if (!prompt || prompt.length < 8 || prompt.startsWith('<')) process.exit(0);

  try { assertLocal(); } catch { process.exit(0); } // never fire against a non-local endpoint

  const facts = (await recallMemory({ topic: prompt, limit: 5 })) as Array<Record<string, unknown>>;
  if (!facts.length) process.exit(0);

  let out = '\n[IRA MEMORY — relevant recall]\n';
  for (const f of facts) {
    const content = String(f.content ?? '').replace(/\s+/g, ' ').trim().slice(0, 220);
    if (!content) continue;
    const tag = String(f.category ?? f.type ?? 'memory');
    out += `- [${tag}] ${content}\n`;
  }
  console.log(out);
  process.exit(0);
}

main().catch(() => process.exit(0));
