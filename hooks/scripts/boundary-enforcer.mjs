import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readEvent, writeOutput } from './lib/normalize.mjs';

const { target, event, payload } = await readEvent();

try {
  const { toolName, cwd } = payload;

  const base = cwd || process.cwd();

  // Resolve IRA project root from this script's location:
  // hooks/scripts/boundary-enforcer.mjs -> ../../
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const iraRoot = join(scriptDir, '..', '..');

  // Determine current agent from state
  const agentFile = join(base, '.ira', 'state', 'current-agent.json');

  if (!existsSync(agentFile)) {
    writeOutput(target, {});
    process.exit(0);
  }

  let currentAgent = null;
  try {
    const agentState = JSON.parse(readFileSync(agentFile, 'utf-8'));
    currentAgent = agentState.agent || null;
  } catch {
    writeOutput(target, {});
    process.exit(0);
  }

  if (!currentAgent) {
    writeOutput(target, {});
    process.exit(0);
  }

  // Read the agent's definition file from agents/<name>.md
  const agentDefPath = join(iraRoot, 'agents', `${currentAgent}.md`);

  if (!existsSync(agentDefPath)) {
    writeOutput(target, {});
    process.exit(0);
  }

  let agentContent;
  try {
    agentContent = readFileSync(agentDefPath, 'utf-8');
  } catch {
    writeOutput(target, {});
    process.exit(0);
  }

  // Parse YAML frontmatter between --- delimiters
  const disallowed = parseFrontmatterDisallowedTools(agentContent);

  if (disallowed.length > 0 && disallowed.includes(toolName)) {
    writeOutput(target, {
      decision: 'block',
      reason: `[IRA BOUNDARY] Agent "${currentAgent}" is not permitted to use tool "${toolName}". Disallowed tools: ${disallowed.join(', ')}.`
    });
    process.exit(0);
  }

  // Pass through
  writeOutput(target, {});
} catch (err) {
  // Graceful failure — never block on error
  console.log(JSON.stringify({}));
}

process.exit(0);

/**
 * Extract disallowedTools array from YAML frontmatter.
 * Expects content starting with --- and ending with ---.
 * Parses the disallowedTools line as a JSON array value.
 * Returns empty array if not found or on parse error.
 */
function parseFrontmatterDisallowedTools(content) {
  // Match frontmatter block
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return [];

  const frontmatter = match[1];

  // Find the disallowedTools line
  const toolsMatch = frontmatter.match(/^disallowedTools:\s*(.+)$/m);
  if (!toolsMatch) return [];

  const value = toolsMatch[1].trim();

  // Parse as JSON array (e.g. ["Write", "Edit"])
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // Not valid JSON — try comma-separated fallback
  }

  return [];
}
