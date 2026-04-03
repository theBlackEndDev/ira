import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

try {
  const input = readFileSync('/dev/stdin', 'utf-8');
  const data = JSON.parse(input);
  const { stopReason, cwd } = data;

  // Never block context limit stops
  if (stopReason === 'context_limit') {
    console.log(JSON.stringify({}));
    process.exit(0);
  }

  // Never block user-initiated aborts
  if (stopReason === 'user_abort' || stopReason === 'user_cancel') {
    console.log(JSON.stringify({}));
    process.exit(0);
  }

  const stateDir = join(cwd || process.cwd(), '.ira', 'state');
  const stateFile = join(stateDir, 'ralph-state.json');

  if (!existsSync(stateFile)) {
    console.log(JSON.stringify({}));
    process.exit(0);
  }

  const state = JSON.parse(readFileSync(stateFile, 'utf-8'));

  // Not active — allow stop
  if (!state.active) {
    console.log(JSON.stringify({}));
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
    console.log(JSON.stringify({}));
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
        console.log(JSON.stringify({}));
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
    console.log(JSON.stringify({}));
    process.exit(0);
  }

  // Block the stop — continue working
  state.iteration = iteration;
  state.lastBlockedAt = new Date().toISOString();
  writeFileSync(stateFile, JSON.stringify(state, null, 2));

  console.log(JSON.stringify({
    decision: 'block',
    reason: `[RALPH LOOP — Iteration ${iteration}/${maxIterations}] Continue working. ISC criteria not yet fully satisfied. Review your progress and continue to the next step.`
  }));
} catch (err) {
  // Graceful failure — never block on error
  console.log(JSON.stringify({}));
}

process.exit(0);
