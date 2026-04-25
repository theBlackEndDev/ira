import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { readEvent, writeOutput } from './lib/normalize.mjs';

// SCHEMA.md: On Codex, `decision:"block"` on the Stop event re-prompts the model
// with the same semantics as on Claude Code. The `reason` field is surfaced to the
// model as context. Because Codex defaults to "No active task remains to continue."
// when blocked with no new user input, the reason text MUST include explicit
// next-action guidance pointing at a specific ISC criterion to resume.

const { target, event, payload } = await readEvent();

try {
  // `stopReason` is synthesised by normalize.mjs for Codex (from stop_hook_active).
  // On Claude Code, it arrives directly as `stopReason` in the payload.
  const { stopReason, cwd } = payload;

  // Never block context limit stops
  if (stopReason === 'context_limit') {
    writeOutput(target, {});
    process.exit(0);
  }

  // Never block user-initiated aborts
  if (stopReason === 'user_abort' || stopReason === 'user_cancel') {
    writeOutput(target, {});
    process.exit(0);
  }

  const stateDir = join(cwd || process.cwd(), '.ira', 'state');
  const stateFile = join(stateDir, 'ralph-state.json');

  if (!existsSync(stateFile)) {
    writeOutput(target, {});
    process.exit(0);
  }

  const state = JSON.parse(readFileSync(stateFile, 'utf-8'));

  // Not active — allow stop
  if (!state.active) {
    writeOutput(target, {});
    process.exit(0);
  }

  // Staleness check: 2-hour timeout
  const startedAt = new Date(state.startedAt).getTime();
  const now = Date.now();
  const twoHours = 2 * 60 * 60 * 1000;

  if (now - startedAt > twoHours) {
    state.active = false;
    state.stoppedReason = 'stale_timeout';
    state.stoppedAt = new Date().toISOString();
    writeFileSync(stateFile, JSON.stringify(state, null, 2));
    writeOutput(target, {});
    process.exit(0);
  }

  // Check if ISC criteria are all met (read work.json)
  const workFile = join(stateDir, 'work.json');
  if (existsSync(workFile)) {
    try {
      const work = JSON.parse(readFileSync(workFile, 'utf-8'));
      if (work.iscTotal > 0 && work.iscChecked >= work.iscTotal) {
        // All ISC criteria met — allow stop, clean up
        state.active = false;
        state.stoppedReason = 'isc_complete';
        state.stoppedAt = new Date().toISOString();
        writeFileSync(stateFile, JSON.stringify(state, null, 2));
        writeOutput(target, {});
        process.exit(0);
      }
    } catch {
      // work.json parse error — continue blocking
    }
  }

  // Check iteration limit
  const iteration = (state.iteration || 0) + 1;
  const maxIterations = state.maxIterations || 25;

  if (iteration >= maxIterations) {
    state.active = false;
    state.stoppedReason = 'max_iterations';
    state.stoppedAt = new Date().toISOString();
    writeFileSync(stateFile, JSON.stringify(state, null, 2));
    writeOutput(target, {});
    process.exit(0);
  }

  // Block the stop — continue working.
  // IMPORTANT: reason must include concrete next-action guidance so Codex
  // (which defaults to "No active task remains to continue." when re-prompted
  // with no user input) has something actionable to act on. See SCHEMA.md §Stop.
  state.iteration = iteration;
  state.lastBlockedAt = new Date().toISOString();
  writeFileSync(stateFile, JSON.stringify(state, null, 2));

  // Build an action-oriented reason. If we know which ISC item is next, name it.
  let nextAction = 'Review your ISC criteria list, check off any completed items, and continue working on the next unchecked criterion.';
  if (existsSync(workFile)) {
    try {
      const work = JSON.parse(readFileSync(workFile, 'utf-8'));
      const remaining = (work.iscTotal || 0) - (work.iscChecked || 0);
      if (remaining > 0) {
        nextAction = `${remaining} ISC criterion/criteria remain unchecked. Open your PRD file, check off completed items with [x], and continue implementing the next unchecked item.`;
      }
    } catch {
      // Keep default
    }
  }

  writeOutput(target, {
    decision: 'block',
    reason: `[RALPH LOOP — Iteration ${iteration}/${maxIterations}] ISC criteria not yet fully satisfied. ${nextAction}`
  });
} catch (err) {
  // Graceful failure — never block on error
  console.log(JSON.stringify({}));
}

process.exit(0);
