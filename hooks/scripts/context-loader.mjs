import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

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
