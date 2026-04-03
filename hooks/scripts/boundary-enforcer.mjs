import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

try {
  const input = readFileSync('/dev/stdin', 'utf-8');
  const data = JSON.parse(input);
  const { toolName, cwd } = data;

  const base = cwd || process.cwd();

  // Load agent boundary config if it exists
  const boundaryFile = join(base, '.ira', 'boundaries.json');
  if (!existsSync(boundaryFile)) {
    console.log(JSON.stringify({}));
    process.exit(0);
  }

  let boundaries;
  try {
    boundaries = JSON.parse(readFileSync(boundaryFile, 'utf-8'));
  } catch {
    console.log(JSON.stringify({}));
    process.exit(0);
  }

  // Determine current agent from state
  const agentFile = join(base, '.ira', 'state', 'current-agent.json');
  let currentAgent = null;

  if (existsSync(agentFile)) {
    try {
      const agentState = JSON.parse(readFileSync(agentFile, 'utf-8'));
      currentAgent = agentState.agent || null;
    } catch {
      // No agent info — allow everything
      console.log(JSON.stringify({}));
      process.exit(0);
    }
  }

  if (!currentAgent) {
    console.log(JSON.stringify({}));
    process.exit(0);
  }

  // Check if agent has disallowed tools
  const agentBoundaries = boundaries.agents && boundaries.agents[currentAgent];
  if (!agentBoundaries) {
    console.log(JSON.stringify({}));
    process.exit(0);
  }

  const disallowed = agentBoundaries.disallowedTools || [];

  if (disallowed.includes(toolName)) {
    console.log(JSON.stringify({
      decision: 'block',
      reason: `[IRA BOUNDARY] Agent "${currentAgent}" is not permitted to use tool "${toolName}". Disallowed tools: ${disallowed.join(', ')}.`
    }));
    process.exit(0);
  }

  // Pass through
  console.log(JSON.stringify({}));
} catch (err) {
  // Graceful failure — never block on error
  console.log(JSON.stringify({}));
}

process.exit(0);
