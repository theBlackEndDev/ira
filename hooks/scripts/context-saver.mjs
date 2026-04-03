import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

try {
  const input = readFileSync('/dev/stdin', 'utf-8');
  const data = JSON.parse(input);
  const { cwd } = data;

  const base = cwd || process.cwd();
  const stateDir = join(base, '.ira', 'state');
  mkdirSync(stateDir, { recursive: true });

  const notepadParts = [];
  notepadParts.push(`# IRA Context Notepad\n\nSaved at: ${new Date().toISOString()}\n`);

  // Save ISC status from work.json
  const workFile = join(stateDir, 'work.json');
  if (existsSync(workFile)) {
    try {
      const work = JSON.parse(readFileSync(workFile, 'utf-8'));
      notepadParts.push(`## ISC Progress\n- Checked: ${work.iscChecked || 0}/${work.iscTotal || 0} (${work.iscProgress || 0}%)\n- Last synced file: ${work.lastSyncedFile || 'none'}\n- Last synced at: ${work.lastSyncedAt || 'never'}`);
    } catch {
      // Skip
    }
  }

  // Save active mode states
  const modes = ['ralph', 'autopilot', 'ultrawork'];
  for (const mode of modes) {
    const modeFile = join(stateDir, `${mode}-state.json`);
    if (existsSync(modeFile)) {
      try {
        const state = JSON.parse(readFileSync(modeFile, 'utf-8'));
        if (state.active) {
          notepadParts.push(`## Active Mode: ${mode.toUpperCase()}\n- Iteration: ${state.iteration || 0}/${state.maxIterations || '?'}\n- Started: ${state.startedAt || 'unknown'}\n- Complexity: ${state.complexity || 'unknown'}\n- Original prompt: ${(state.prompt || '').slice(0, 300)}`);
        }
      } catch {
        // Skip
      }
    }
  }

  // Save any existing notepad content that was manually added
  const notepadFile = join(stateDir, 'notepad.md');
  if (existsSync(notepadFile)) {
    try {
      const existing = readFileSync(notepadFile, 'utf-8').trim();
      // Check for manually added sections (not auto-generated)
      const manualSections = existing.split('\n## ').filter(s =>
        !s.startsWith('ISC Progress') &&
        !s.startsWith('Active Mode:') &&
        !s.startsWith('# IRA Context Notepad')
      );
      if (manualSections.length > 0) {
        notepadParts.push(`## Previous Notes\n${manualSections.join('\n## ')}`);
      }
    } catch {
      // Skip
    }
  }

  writeFileSync(notepadFile, notepadParts.join('\n\n'));

  console.log(JSON.stringify({}));
} catch (err) {
  console.log(JSON.stringify({}));
}

process.exit(0);
