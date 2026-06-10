import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { readEvent, writeOutput } from './lib/normalize.mjs';

const { target, event, payload } = await readEvent();

try {
  const { toolName, toolInput, toolOutput, cwd } = payload;
  const base = cwd || process.cwd();
  const stateDir = join(base, '.ira', 'state');
  const agentFile = join(stateDir, 'current-agent.json');

  // Agent-context lifecycle: bracket the subagent invocation so the boundary
  // enforcer only restricts tool calls during the subagent's run. PreToolUse
  // writes the stamp before the subagent spawns; PostToolUse and SubagentStop
  // clear it on exit (PostToolUse covers the happy path; SubagentStop is the
  // crash-safety net).
  if (toolName === 'Agent' && event === 'PreToolUse' && toolInput) {
    const agentName = toolInput.subagent_type || toolInput.name || null;
    if (agentName) {
      mkdirSync(stateDir, { recursive: true });
      writeFileSync(agentFile, JSON.stringify({
        agent: agentName.toLowerCase(),
        startedAt: new Date().toISOString(),
      }, null, 2));
    }
    writeOutput(target, {});
    process.exit(0);
  }

  if (event === 'SubagentStop' || (toolName === 'Agent' && event === 'PostToolUse')) {
    if (existsSync(agentFile)) {
      try { unlinkSync(agentFile); } catch {}
    }
    writeOutput(target, {});
    process.exit(0);
  }

  // Only process Write/Edit of PRD-like files for ISC sync
  if (toolName !== 'Write' && toolName !== 'Edit') {
    writeOutput(target, {});
    process.exit(0);
  }

  const filePath = (toolInput && (toolInput.file_path || toolInput.path)) || '';
  const isPRD = /\b(prd|spec|requirements|criteria|isc)\b/i.test(filePath) ||
                filePath.endsWith('.prd.md') ||
                filePath.includes('/prd/');

  if (!isPRD) {
    writeOutput(target, {});
    process.exit(0);
  }

  // Read the file to count ISC criteria
  let fileContent = '';
  try {
    if (toolName === 'Write' && toolInput && toolInput.content) {
      fileContent = toolInput.content;
    } else if (existsSync(filePath)) {
      fileContent = readFileSync(filePath, 'utf-8');
    }
  } catch {
    writeOutput(target, {});
    process.exit(0);
  }

  if (!fileContent) {
    writeOutput(target, {});
    process.exit(0);
  }

  // Count checked and unchecked checkboxes as ISC criteria
  const checkedPattern = /- \[x\]/gi;
  const uncheckedPattern = /- \[ \]/g;

  const checkedMatches = fileContent.match(checkedPattern) || [];
  const uncheckedMatches = fileContent.match(uncheckedPattern) || [];

  const iscChecked = checkedMatches.length;
  const iscTotal = iscChecked + uncheckedMatches.length;

  if (iscTotal === 0) {
    writeOutput(target, {});
    process.exit(0);
  }

  // Write state
  mkdirSync(stateDir, { recursive: true });

  const workFile = join(stateDir, 'work.json');
  let work = {};

  if (existsSync(workFile)) {
    try {
      work = JSON.parse(readFileSync(workFile, 'utf-8'));
    } catch {
      work = {};
    }
  }

  work.iscChecked = iscChecked;
  work.iscTotal = iscTotal;
  work.iscProgress = iscTotal > 0 ? Math.round((iscChecked / iscTotal) * 100) : 0;
  work.lastSyncedFile = filePath;
  work.lastSyncedAt = new Date().toISOString();

  writeFileSync(workFile, JSON.stringify(work, null, 2));

  writeOutput(target, {});
} catch (err) {
  console.log(JSON.stringify({}));
}

process.exit(0);
