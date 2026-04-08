import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const MEMORY_PROJECT = '/home/hus/golden-claw-workspace/orchestrator/projects/ira-memory';

try {
  const input = readFileSync('/dev/stdin', 'utf-8');
  const data = JSON.parse(input);
  const { sessionId, cwd } = data;

  const base = cwd || process.cwd();
  const stateDir = join(base, '.ira', 'state');
  const memoryDir = join(base, '.ira', 'memory');
  mkdirSync(stateDir, { recursive: true });
  mkdirSync(memoryDir, { recursive: true });

  const now = new Date().toISOString();

  // Collect session metadata
  const sessionMeta = {
    event: 'session_end',
    sessionId: sessionId || 'unknown',
    endedAt: now,
    modes: [],
    iscProgress: null,
  };

  // Archive active mode states
  const modes = ['ralph', 'autopilot', 'ultrawork'];
  for (const mode of modes) {
    const modeFile = join(stateDir, `${mode}-state.json`);
    if (existsSync(modeFile)) {
      try {
        const state = JSON.parse(readFileSync(modeFile, 'utf-8'));
        sessionMeta.modes.push({
          mode,
          active: state.active,
          iteration: state.iteration || 0,
          startedAt: state.startedAt,
        });

        // Clean up stale states (older than 2 hours)
        if (state.startedAt) {
          const age = Date.now() - new Date(state.startedAt).getTime();
          const twoHours = 2 * 60 * 60 * 1000;
          if (age > twoHours) {
            state.active = false;
            state.stoppedReason = 'session_end_stale';
            state.stoppedAt = now;
            writeFileSync(modeFile, JSON.stringify(state, null, 2));
          }
        }
      } catch {
        // Skip corrupted state
      }
    }
  }

  // Capture ISC progress
  const workFile = join(stateDir, 'work.json');
  if (existsSync(workFile)) {
    try {
      const work = JSON.parse(readFileSync(workFile, 'utf-8'));
      sessionMeta.iscProgress = {
        checked: work.iscChecked || 0,
        total: work.iscTotal || 0,
        percent: work.iscProgress || 0,
      };
    } catch {
      // Skip
    }
  }

  // Archive rating if ISC work was done
  if (sessionMeta.iscProgress && sessionMeta.iscProgress.total > 0) {
    const ratingsFile = join(base, '.ira', 'learning', 'ratings.jsonl');
    try {
      mkdirSync(join(base, '.ira', 'learning'), { recursive: true });
      const ratingEntry = {
        timestamp: now,
        sessionId: sessionId || 'unknown',
        iscTotal: sessionMeta.iscProgress.total,
        iscChecked: sessionMeta.iscProgress.checked,
        iscPercent: sessionMeta.iscProgress.percent,
        modes: sessionMeta.modes.filter(m => m.active).map(m => m.mode),
      };
      appendFileSync(ratingsFile, JSON.stringify(ratingEntry) + '\n');
    } catch { /* skip */ }
  }

  // Append to events log
  const eventsFile = join(base, '.ira', 'events.jsonl');
  appendFileSync(eventsFile, JSON.stringify(sessionMeta) + '\n');

  // ─── IRA Memory DB: Close session ─────────────────────────────
  try {
    const memSessionFile = join(stateDir, 'memory-session.json');
    if (existsSync(memSessionFile)) {
      const memSession = JSON.parse(readFileSync(memSessionFile, 'utf-8'));
      if (memSession.sessionId) {
        execSync(
          `cd ${MEMORY_PROJECT} && bun run src/hook-bridge.ts session-close ${memSession.sessionId}`,
          { timeout: 25000, encoding: 'utf-8' }
        );
        unlinkSync(memSessionFile);
      }
    }
  } catch (dbErr) {
    // DB failures are non-fatal
  }

  console.log(JSON.stringify({}));
} catch (err) {
  console.log(JSON.stringify({}));
}

process.exit(0);
