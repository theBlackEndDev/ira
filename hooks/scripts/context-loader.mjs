import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

try {
  const input = readFileSync('/dev/stdin', 'utf-8');
  const data = JSON.parse(input);
  const { cwd } = data;

  const base = cwd || process.cwd();
  const contextParts = [];

  // Load project memory
  const memoryFile = join(base, '.ira', 'memory', 'project-memory.json');
  if (existsSync(memoryFile)) {
    try {
      const memory = JSON.parse(readFileSync(memoryFile, 'utf-8'));
      if (memory.summary) {
        contextParts.push(`[IRA PROJECT MEMORY] ${memory.summary}`);
      }
      if (memory.keyDecisions && memory.keyDecisions.length > 0) {
        contextParts.push(`[IRA KEY DECISIONS] ${memory.keyDecisions.join('; ')}`);
      }
    } catch {
      // Corrupted memory file — skip
    }
  }

  // Load TELOS context if configured
  const telosConfig = join(base, '.ira', 'telos.json');
  if (existsSync(telosConfig)) {
    try {
      const telos = JSON.parse(readFileSync(telosConfig, 'utf-8'));
      if (telos.context) {
        contextParts.push(`[IRA TELOS] ${telos.context}`);
      }
    } catch {
      // Skip
    }
  }

  // Check for active ralph state from previous session
  const ralphState = join(base, '.ira', 'state', 'ralph-state.json');
  if (existsSync(ralphState)) {
    try {
      const state = JSON.parse(readFileSync(ralphState, 'utf-8'));
      if (state.active) {
        const startedAt = new Date(state.startedAt).getTime();
        const twoHours = 2 * 60 * 60 * 1000;
        if (Date.now() - startedAt < twoHours) {
          contextParts.push(`[IRA ACTIVE MODE: RALPH] Iteration ${state.iteration || 0}/${state.maxIterations || 25}. Resuming from previous session. Original prompt: "${(state.prompt || '').slice(0, 200)}"`);
        }
      }
    } catch {
      // Skip
    }
  }

  // Check for active autopilot state
  const autopilotState = join(base, '.ira', 'state', 'autopilot-state.json');
  if (existsSync(autopilotState)) {
    try {
      const state = JSON.parse(readFileSync(autopilotState, 'utf-8'));
      if (state.active) {
        const startedAt = new Date(state.startedAt).getTime();
        const twoHours = 2 * 60 * 60 * 1000;
        if (Date.now() - startedAt < twoHours) {
          contextParts.push(`[IRA ACTIVE MODE: AUTOPILOT] Iteration ${state.iteration || 0}/${state.maxIterations || 10}. Resuming from previous session.`);
        }
      }
    } catch {
      // Skip
    }
  }

  // Check for saved notepad from compaction
  const notepad = join(base, '.ira', 'state', 'notepad.md');
  if (existsSync(notepad)) {
    try {
      const content = readFileSync(notepad, 'utf-8').trim();
      if (content) {
        contextParts.push(`[IRA NOTEPAD — Saved before compaction]\n${content}`);
      }
    } catch {
      // Skip
    }
  }

  if (contextParts.length === 0) {
    console.log(JSON.stringify({}));
    process.exit(0);
  }

  console.log(JSON.stringify({
    hookSpecificOutput: {
      additionalContext: contextParts.join('\n\n')
    }
  }));
} catch (err) {
  console.log(JSON.stringify({}));
}

process.exit(0);
