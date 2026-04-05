import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

try {
  const input = readFileSync('/dev/stdin', 'utf-8');
  const data = JSON.parse(input);
  const { toolName, toolInput, toolOutput, cwd } = data;

  // Track current agent from Agent tool invocations
  if (toolName === 'Agent' && toolInput) {
    const agentName = toolInput.subagent_type || toolInput.name || null;
    if (agentName) {
      const base = cwd || process.cwd();
      const stateDir = join(base, '.ira', 'state');
      mkdirSync(stateDir, { recursive: true });
      const agentFile = join(stateDir, 'current-agent.json');
      writeFileSync(agentFile, JSON.stringify({
        agent: agentName.toLowerCase(),
        startedAt: new Date().toISOString(),
      }, null, 2));
    }
  }

  // Only process Write/Edit of PRD-like files for ISC sync
  if (toolName !== 'Write' && toolName !== 'Edit') {
    console.log(JSON.stringify({}));
    process.exit(0);
  }

  const filePath = (toolInput && (toolInput.file_path || toolInput.path)) || '';
  const isPRD = /\b(prd|spec|requirements|criteria|isc)\b/i.test(filePath) ||
                filePath.endsWith('.prd.md') ||
                filePath.includes('/prd/');

  if (!isPRD) {
    console.log(JSON.stringify({}));
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
    console.log(JSON.stringify({}));
    process.exit(0);
  }

  if (!fileContent) {
    console.log(JSON.stringify({}));
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
    console.log(JSON.stringify({}));
    process.exit(0);
  }

  // Write state
  const base = cwd || process.cwd();
  const stateDir = join(base, '.ira', 'state');
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

  console.log(JSON.stringify({}));
} catch (err) {
  console.log(JSON.stringify({}));
}

process.exit(0);
