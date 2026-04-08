import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { homedir } from 'os';

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
const BRIDGE = MEMORY_PROJECT ? join(MEMORY_PROJECT, 'src', 'hook-bridge.ts') : null;

try {
  const input = readFileSync('/dev/stdin', 'utf-8');
  const data = JSON.parse(input);
  const { cwd } = data;

  const base = cwd || process.cwd();
  const contextParts = [];

  // Load project memory from .ira/memory/projects/
  const projectsDir = join(base, '.ira', 'memory', 'projects');
  if (existsSync(projectsDir)) {
    try {
      const memoryParts = [];
      const projects = readdirSync(projectsDir, { withFileTypes: true })
        .filter(d => d.isDirectory());
      for (const project of projects.slice(0, 5)) {
        const projDir = join(projectsDir, project.name);
        const files = readdirSync(projDir).filter(f => f.endsWith('.md') && f !== 'MEMORY.md');
        for (const file of files.slice(0, 3)) {
          try {
            const content = readFileSync(join(projDir, file), 'utf-8').trim();
            if (content) memoryParts.push(content.slice(0, 500));
          } catch { /* skip */ }
        }
      }
      if (memoryParts.length > 0) {
        contextParts.push(`[IRA PROJECT MEMORY]\n${memoryParts.join('\n---\n')}`);
      }
    } catch {
      // Skip
    }
  }

  // Load TELOS context from .ira/telos/ directory
  const telosDir = join(base, '.ira', 'telos');
  if (existsSync(telosDir)) {
    try {
      const telosParts = [];
      const files = readdirSync(telosDir).filter(f => f.endsWith('.md'));
      for (const file of files) {
        try {
          const content = readFileSync(join(telosDir, file), 'utf-8').trim();
          if (content) telosParts.push(`### ${file.replace('.md', '')}\n${content.slice(0, 500)}`);
        } catch { /* skip */ }
      }
      if (telosParts.length > 0) {
        contextParts.push(`[IRA TELOS]\n${telosParts.join('\n')}`);
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

  // Check for active ultrawork state
  const ultraworkState = join(base, '.ira', 'state', 'ultrawork-state.json');
  if (existsSync(ultraworkState)) {
    try {
      const state = JSON.parse(readFileSync(ultraworkState, 'utf-8'));
      if (state.active) {
        const startedAt = new Date(state.startedAt).getTime();
        const twoHours = 2 * 60 * 60 * 1000;
        if (Date.now() - startedAt < twoHours) {
          contextParts.push(`[IRA ACTIVE MODE: ULTRAWORK] Resuming from previous session. Maximum parallelization enabled.`);
        }
      }
    } catch {
      // Skip
    }
  }

  // Load recent learning signals
  const ratingsFile = join(base, '.ira', 'learning', 'ratings.jsonl');
  if (existsSync(ratingsFile)) {
    try {
      const content = readFileSync(ratingsFile, 'utf-8').trim();
      if (content) {
        const lines = content.split('\n').filter(l => l.trim());
        const recent = lines.slice(-5); // last 5 ratings
        const lowRatings = recent
          .map(l => { try { return JSON.parse(l); } catch { return null; } })
          .filter(r => r && r.rating <= 3);
        if (lowRatings.length > 0) {
          const warnings = lowRatings.map(r => `- Rating ${r.rating}: ${r.reason || r.task || 'no details'}`).join('\n');
          contextParts.push(`[IRA LEARNING — Recent low ratings]\n${warnings}`);
        }
      }
    } catch { /* skip */ }
  }

  // Load user config files from .ira/user/
  const userDir = join(base, '.ira', 'user');
  if (existsSync(userDir)) {
    try {
      const userFiles = readdirSync(userDir).filter(f => f.endsWith('.md'));
      const userParts = [];
      for (const file of userFiles.slice(0, 5)) {
        try {
          const content = readFileSync(join(userDir, file), 'utf-8').trim();
          if (content) userParts.push(content.slice(0, 500));
        } catch { /* skip */ }
      }
      if (userParts.length > 0) {
        contextParts.push(`[IRA USER CONFIG]\n${userParts.join('\n---\n')}`);
      }
    } catch { /* skip */ }
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

  // ─── IRA Memory DB: Open session + recall context ─────────────
  if (MEMORY_PROJECT) {
    try {
      const sessionId = execSync(
        `cd ${MEMORY_PROJECT} && bun run src/hook-bridge.ts session-open cli "Claude Code Session"`,
        { timeout: 4000, encoding: 'utf-8' }
      ).trim();

      if (sessionId) {
        const stateDir = join(base, '.ira', 'state');
        mkdirSync(stateDir, { recursive: true });
        writeFileSync(
          join(stateDir, 'memory-session.json'),
          JSON.stringify({ sessionId, startedAt: new Date().toISOString() })
        );

        const dbContext = execSync(
          `cd ${MEMORY_PROJECT} && bun run src/hook-bridge.ts recall-context ${sessionId}`,
          { timeout: 4000, encoding: 'utf-8' }
        ).trim();

        if (dbContext) {
          contextParts.push(dbContext);
        }
      }
    } catch (dbErr) {
      // DB failures are non-fatal
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
