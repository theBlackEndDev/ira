/**
 * normalize.mjs — Dual-target hook stdin normalizer.
 *
 * Reads stdin, detects whether the event was dispatched by Claude Code or
 * Codex CLI, and returns a canonical envelope using Claude's camelCase field
 * names. All hook scripts import from here instead of parsing stdin directly.
 *
 * Detection: Codex always includes `hook_event_name` (snake_case). Claude Code
 * never does — it uses `hookEventName` when it surfaces the event name at all.
 * If neither is present (unknown shape), we default to target:"claude" to
 * minimise regression risk on the Claude path.
 *
 * Field-name remap (Codex snake → Claude camel), per SCHEMA.md:
 *   session_id       → sessionId
 *   tool_name        → toolName
 *   tool_input       → toolInput
 *   tool_response    → toolOutput   (note: word change, not just case)
 *   hook_event_name  → hookEventName (informational; `event` is the primary)
 *   transcript_path, model, permission_mode, tool_use_id, turn_id,
 *   stop_hook_active, last_assistant_message, source — passed through unchanged
 *
 * Stop event synthesis: Codex surfaces `stop_hook_active` + `last_assistant_message`
 * rather than a `stopReason` string. We synthesise:
 *   stopReason = stop_hook_active ? "ralph-block" : "session-end"
 * The raw `stop_hook_active` field is preserved so session-harvester can gate
 * on it directly (SCHEMA.md: Stop with stop_hook_active===false is the real
 * SessionEnd substitute on Codex).
 *
 * Output shape from readEvent():
 *   { target: "claude"|"codex", event: string, payload: object }
 * where payload uses Claude camelCase keys throughout.
 *
 * writeOutput(target, output): writes JSON to stdout. Both targets currently
 * accept the same output shape. This function is the seam for future divergence.
 */

import { readFileSync } from 'fs';

/**
 * Read stdin, detect target, normalise payload.
 * @returns {{ target: "claude"|"codex", event: string, payload: object }}
 */
export async function readEvent() {
  let raw;
  try {
    raw = readFileSync('/dev/stdin', 'utf-8');
  } catch {
    // Fallback for environments where /dev/stdin is unavailable
    raw = await readStdinAsync();
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    // Unparseable stdin — return safe defaults
    return { target: 'claude', event: 'unknown', payload: {} };
  }

  return normalizeData(data);
}

/**
 * Fallback stdin reader using process.stdin stream (for non-/dev/stdin envs).
 */
function readStdinAsync() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', chunk => chunks.push(chunk));
    process.stdin.on('end', () => resolve(chunks.join('')));
    process.stdin.on('error', reject);
  });
}

/**
 * Detect target and normalise a parsed payload object.
 * Exported so the smoke test can call it synchronously with fixture data.
 *
 * @param {object} data — raw parsed JSON from hook stdin
 * @returns {{ target: "claude"|"codex", event: string, payload: object }}
 */
export function normalizeData(data) {
  // Both Claude Code and Codex use snake_case `hook_event_name` on the wire
  // (verified empirically — see docs/codex-hook-schema.md). The discriminator
  // is the transcript_path: Codex writes ~/.codex/sessions/..., Claude writes
  // ~/.claude/projects/... last_assistant_message is also Codex-only and a
  // useful secondary signal on Stop events. Default → claude (back-compat).
  const tp = typeof data.transcript_path === 'string' ? data.transcript_path : '';
  const model = typeof data.model === 'string' ? data.model : '';
  const isCodex =
    tp.includes('/.codex/') ||
    tp.includes('/codex/sessions') ||
    typeof data.last_assistant_message === 'string' ||
    /^(gpt-|o\d)/.test(model);
  const target = isCodex ? 'codex' : 'claude';

  if (!isCodex) {
    // Claude Code path — wire is snake_case but most existing hook scripts
    // already destructure Claude camelCase. Remap session_id→sessionId and
    // pass the rest through. Synthesize stopReason if a Stop event shows up.
    const event = data.hook_event_name || data.hookEventName || data.type || 'unknown';
    const payload = {
      ...data,
      sessionId: data.session_id ?? data.sessionId,
      toolName: data.tool_name ?? data.toolName,
      toolInput: data.tool_input ?? data.toolInput,
      toolOutput: data.tool_response ?? data.tool_output ?? data.toolOutput,
      hookEventName: data.hook_event_name || data.hookEventName,
    };
    return { target, event, payload };
  }

  // Codex path — remap snake_case → camelCase.
  const event = data.hook_event_name;

  const payload = {
    // Shared base fields
    sessionId: data.session_id,
    cwd: data.cwd,
    hookEventName: data.hook_event_name,
    // Codex-only pass-throughs
    transcript_path: data.transcript_path,
    model: data.model,
    permission_mode: data.permission_mode,
    turn_id: data.turn_id,
    tool_use_id: data.tool_use_id,
    source: data.source,
    // Per-event renames
    toolName: data.tool_name,
    toolInput: data.tool_input,
    toolOutput: data.tool_response,   // word change: tool_response → toolOutput
    // UserPromptSubmit
    prompt: data.prompt,
    // Stop event
    stop_hook_active: data.stop_hook_active,
    last_assistant_message: data.last_assistant_message,
  };

  // Synthesise stopReason from Codex Stop event fields.
  // session-harvester gates on stop_hook_active directly; ralph-loop reads stopReason.
  if (event === 'Stop') {
    payload.stopReason = data.stop_hook_active ? 'ralph-block' : 'session-end';
  }

  // Remove keys that were undefined (keep payload clean).
  for (const k of Object.keys(payload)) {
    if (payload[k] === undefined) delete payload[k];
  }

  return { target, event, payload };
}

/**
 * Write a hook output object to stdout as JSON.
 * Both Claude Code and Codex accept the same output shape, so this is a thin
 * wrapper today. It is the seam for future per-target output divergence.
 *
 * @param {"claude"|"codex"} _target — reserved for future divergence
 * @param {object} output
 */
export function writeOutput(_target, output) {
  console.log(JSON.stringify(output));
}
