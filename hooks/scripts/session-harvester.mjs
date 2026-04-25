import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { homedir } from 'os';
import { readEvent, writeOutput } from './lib/normalize.mjs';
import { logConversation } from './lib/ira-memory.mjs';

function getMemoryProject() {
  if (process.env.IRA_MEMORY_PROJECT) return process.env.IRA_MEMORY_PROJECT;
  try {
    const configPath = join(homedir(), '.config', 'ira', 'config.jsonc');
    const raw = readFileSync(configPath, 'utf-8').replace(/\/\/.*/g, '').replace(/,\s*([}\]])/g, '$1');
    const config = JSON.parse(raw);
    return config.integrations?.memoryProject || null;
  } catch { return null; }
}

const MEMORY_PROJECT = getMemoryProject();

const { target, event, payload } = await readEvent();

let _logPending = null;

// ─── Codex SessionEnd gate ────────────────────────────────────────────────────
// SCHEMA.md: Codex has no SessionEnd event. The Stop event with
// stop_hook_active===false is the "real" final stop (the real SessionEnd).
// stop_hook_active===true means the previous stop was Ralph-induced — do NOT
// harvest yet, the session is still running.
// Claude Code path: this script is registered on SessionEnd, so no gate needed.
if (target === 'codex') {
  if (payload.stop_hook_active !== false) {
    // Ralph-induced re-fire or unknown state — skip harvesting
    writeOutput(target, {});
    process.exit(0);
  }
  // stop_hook_active===false → real session end → log assistant turn then harvest.
  // Codex provides `last_assistant_message` in the Stop payload; Claude does not.
  if (payload.last_assistant_message) {
    _logPending = logConversation({
      role: 'assistant',
      content: payload.last_assistant_message,
      channel: 'codex',
      sessionId: payload.sessionId,
      transcriptPath: payload.transcript_path,
    }).catch(() => {});
  }
  // TODO: Claude assistant logging via transcript_path
}

try {
  const { sessionId, cwd } = payload;

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
  if (MEMORY_PROJECT) {
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
  }

  writeOutput(target, {});
} catch (err) {
  console.log(JSON.stringify({}));
}

if (_logPending) await _logPending;
process.exit(0);
