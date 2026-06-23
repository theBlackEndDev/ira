import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs';
import { join } from 'path';

try {
  const input = readFileSync('/dev/stdin', 'utf-8');
  const data = JSON.parse(input);
  const cwd = data.cwd || process.env.GEMINI_PROJECT_DIR || process.cwd();

  const contextParts = [];

  // Load project memory from .gira/memory/projects/
  const projectsDir = join(cwd, '.gira', 'memory', 'projects');
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
        contextParts.push(`[GIRA PROJECT MEMORY]\n${memoryParts.join('\n---\n')}`);
      }
    } catch { /* skip */ }
  }

  // Check for active autopilot state
  const autopilotState = join(cwd, '.gira', 'state', 'autopilot-state.json');
  if (existsSync(autopilotState)) {
    try {
      const state = JSON.parse(readFileSync(autopilotState, 'utf-8'));
      if (state.active) {
        const startedAt = new Date(state.startedAt).getTime();
        const twoHours = 2 * 60 * 60 * 1000;
        if (Date.now() - startedAt < twoHours) {
          contextParts.push(`[GIRA ACTIVE MODE: AUTOPILOT] Iteration ${state.iteration || 0}/${state.maxIterations || 10}. Resuming from previous session.`);
        }
      }
    } catch { /* skip */ }
  }

  // Check for active ultrawork state
  const ultraworkState = join(cwd, '.gira', 'state', 'ultrawork-state.json');
  if (existsSync(ultraworkState)) {
    try {
      const state = JSON.parse(readFileSync(ultraworkState, 'utf-8'));
      if (state.active) {
        const startedAt = new Date(state.startedAt).getTime();
        const twoHours = 2 * 60 * 60 * 1000;
        if (Date.now() - startedAt < twoHours) {
          contextParts.push(`[GIRA ACTIVE MODE: ULTRAWORK] Resuming from previous session. Maximum parallelization enabled.`);
        }
      }
    } catch { /* skip */ }
  }

  // Load recent learning signals
  const ratingsFile = join(cwd, '.gira', 'learning', 'ratings.jsonl');
  if (existsSync(ratingsFile)) {
    try {
      const content = readFileSync(ratingsFile, 'utf-8').trim();
      if (content) {
        const lines = content.split('\n').filter(l => l.trim());
        const recent = lines.slice(-5);
        const lowRatings = recent
          .map(l => { try { return JSON.parse(l); } catch { return null; } })
          .filter(r => r && r.rating <= 3);
        if (lowRatings.length > 0) {
          const warnings = lowRatings.map(r => `- Rating ${r.rating}: ${r.reason || r.task || 'no details'}`).join('\n');
          contextParts.push(`[GIRA LEARNING — Recent low ratings]\n${warnings}`);
        }
      }
    } catch { /* skip */ }
  }

  // Load user config files from .gira/user/
  const userDir = join(cwd, '.gira', 'user');
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
        contextParts.push(`[GIRA USER CONFIG]\n${userParts.join('\n---\n')}`);
      }
    } catch { /* skip */ }
  }

  // Check for saved notepad from compaction
  const notepad = join(cwd, '.gira', 'state', 'notepad.md');
  if (existsSync(notepad)) {
    try {
      const content = readFileSync(notepad, 'utf-8').trim();
      if (content) {
        contextParts.push(`[GIRA NOTEPAD — Saved before compaction]\n${content}`);
      }
    } catch { /* skip */ }
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
