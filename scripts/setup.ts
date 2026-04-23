#!/usr/bin/env bun
/**
 * IRA — First-time installation script
 *
 * This script:
 * 1. Creates .ira/ directory structure in cwd
 * 2. Generates .ira/boundaries.json from agent frontmatter
 * 3. Registers IRA hooks in ~/.claude/settings.json
 * 4. Rebrands PAI→IRA in settings.json (env vars, config, docs)
 * 5. Rebrands PAI→IRA in statusline script (if present)
 * 6. Migrates .env from ~/.config/PAI/ to ~/.config/ira/
 * 7. Symlinks ~/.claude/CLAUDE.md to IRA's CLAUDE.md
 * 8. Creates default config at ~/.config/ira/config.jsonc
 * 9. Runs bun install if node_modules doesn't exist
 *
 * Cross-platform: macOS and Linux (Ubuntu/Debian, Fedora, Arch)
 *
 * Usage:
 *   bun run scripts/setup.ts [options]
 *
 * Options:
 *   --dry-run   Show what would happen without doing it
 *   --help      Show help
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, lstatSync, rmSync, readdirSync } from "fs";
import { join, resolve, dirname } from "path";
import { execSync } from "child_process";
import { homedir } from "os";
import { rebrandSettingsJson, rebrandStatusline, migrateConfigEnv } from "./lib/rebrand.ts";

const HOME = homedir();
const CLAUDE_DIR = join(HOME, ".claude");
const CLAUDE_MD = join(CLAUDE_DIR, "CLAUDE.md");
const SETTINGS_JSON = join(CLAUDE_DIR, "settings.json");

// Auto-detect IRA path (directory containing this script's parent)
const SCRIPT_DIR = dirname(new URL(import.meta.url).pathname);
const IRA_DIR = resolve(SCRIPT_DIR, "..");
const IRA_CLAUDE_MD = join(IRA_DIR, "CLAUDE.md");
const IRA_HOOKS_JSON = join(IRA_DIR, "hooks", "hooks.json");
const AGENTS_DIR = join(IRA_DIR, "agents");
const IRA_SKILLS_DIR = join(IRA_DIR, "skills");
const CLAUDE_SKILLS_DIR = join(CLAUDE_DIR, "skills");

interface Args {
  dryRun: boolean;
  help: boolean;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes("--dry-run"),
    help: args.includes("--help"),
  };
}

function log(msg: string) {
  console.log(`  ${msg}`);
}

function logAction(action: string, detail: string) {
  console.log(`  ${action.padEnd(12)} ${detail}`);
}

function showHelp() {
  console.log(`
IRA — First-Time Setup

Usage: bun run scripts/setup.ts [options]

Options:
  --dry-run   Show what would happen without doing it
  --help      Show this help

What this does:
  1. Creates .ira/ directory structure in the current working directory
  2. Generates .ira/boundaries.json from agents/*.md frontmatter
  3. Registers IRA hooks in ~/.claude/settings.json
  4. Rebrands PAI→IRA in settings.json (env vars, config, docs)
  5. Rebrands PAI→IRA in statusline script (if present)
  6. Migrates .env from ~/.config/PAI/ to ~/.config/ira/
  7. Symlinks ~/.claude/CLAUDE.md to IRA's CLAUDE.md
  8. Creates default config at ~/.config/ira/config.jsonc
  9. Runs bun install if node_modules/ doesn't exist
`);
}

// Step 1: Create .ira/ directory structure
function createDirectoryStructure(dryRun: boolean) {
  const base = process.cwd();
  const dirs = [
    ".ira/state",
    ".ira/work",
    ".ira/memory",
    ".ira/learning",
    ".ira/learning/reflections",
    ".ira/learning/failures",
    ".ira/learning/synthesis",
    ".ira/telos",
    ".ira/user",
  ];

  for (const dir of dirs) {
    const fullPath = join(base, dir);
    if (existsSync(fullPath)) {
      logAction("EXISTS", fullPath);
    } else if (dryRun) {
      logAction("CREATE", fullPath);
    } else {
      mkdirSync(fullPath, { recursive: true });
      logAction("CREATED", fullPath);
    }
  }
}

// Step 2: Generate boundaries.json from agent frontmatter
function generateBoundaries(dryRun: boolean) {
  const base = process.cwd();
  const boundariesFile = join(base, ".ira", "boundaries.json");

  if (!existsSync(AGENTS_DIR)) {
    log("Warning: agents/ directory not found, skipping boundaries generation");
    return;
  }

  const agentFiles = readdirSync(AGENTS_DIR).filter((f) => f.endsWith(".md"));
  const agents: Record<string, { disallowedTools: string[] }> = {};

  for (const file of agentFiles) {
    const content = readFileSync(join(AGENTS_DIR, file), "utf-8");

    // Parse YAML frontmatter between --- delimiters
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) continue;

    const frontmatter = fmMatch[1];

    // Extract name
    const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
    const name = nameMatch ? nameMatch[1].trim() : file.replace(".md", "");

    // Extract disallowedTools
    const toolsMatch = frontmatter.match(/^disallowedTools:\s*(\[.*\])$/m);
    let disallowedTools: string[] = [];
    if (toolsMatch) {
      try {
        disallowedTools = JSON.parse(toolsMatch[1]);
      } catch {
        // Skip malformed
      }
    }

    agents[name] = { disallowedTools };
  }

  const boundaries = { agents };

  if (dryRun) {
    logAction("GENERATE", boundariesFile);
    const agentCount = Object.keys(agents).length;
    const restricted = Object.entries(agents).filter(([, v]) => v.disallowedTools.length > 0);
    logAction("", `  ${agentCount} agents found, ${restricted.length} with restrictions`);
  } else {
    mkdirSync(join(base, ".ira"), { recursive: true });
    writeFileSync(boundariesFile, JSON.stringify(boundaries, null, 2));
    logAction("GENERATED", boundariesFile);
  }
}

// Step 3: Register IRA hooks in ~/.claude/settings.json
function registerHooks(dryRun: boolean) {
  if (!existsSync(IRA_HOOKS_JSON)) {
    log("Warning: hooks/hooks.json not found, skipping hook registration");
    return;
  }

  // Ensure ~/.claude/ exists
  if (!existsSync(CLAUDE_DIR)) {
    if (!dryRun) {
      mkdirSync(CLAUDE_DIR, { recursive: true });
    }
  }

  // Read or create settings.json
  let settings: any = { hooks: {} };
  if (existsSync(SETTINGS_JSON)) {
    try {
      settings = JSON.parse(readFileSync(SETTINGS_JSON, "utf-8"));
    } catch {
      log("Warning: settings.json was malformed, creating fresh");
      settings = { hooks: {} };
    }
  }

  if (!settings.hooks) {
    settings.hooks = {};
  }

  const iraHooksConfig = JSON.parse(readFileSync(IRA_HOOKS_JSON, "utf-8"));
  const iraHooks = iraHooksConfig.hooks ?? {};

  let addedCount = 0;

  for (const [event, hookList] of Object.entries(iraHooks)) {
    if (!Array.isArray(hookList)) continue;

    if (!settings.hooks[event]) {
      settings.hooks[event] = [];
    }

    for (const entry of hookList as any[]) {
      // Resolve hook command paths relative to IRA project
      const resolvedEntry = {
        ...entry,
        hooks: (entry.hooks || []).map((h: any) => ({
          ...h,
          command: h.command?.replace(
            /^node hooks\//,
            `node ${join(IRA_DIR, "hooks")}/`
          ),
        })),
      };

      // Check if already registered (compare first hook command)
      const resolvedCmd = resolvedEntry.hooks[0]?.command;
      const exists = settings.hooks[event].some(
        (e: any) => e.hooks?.[0]?.command === resolvedCmd
      );

      if (!exists) {
        settings.hooks[event].push(resolvedEntry);
        addedCount++;
        if (dryRun) {
          logAction("ADD", `${event}: ${resolvedCmd}`);
        }
      } else {
        if (dryRun) {
          logAction("EXISTS", `${event}: ${resolvedCmd}`);
        }
      }
    }
  }

  if (dryRun) {
    logAction("HOOKS", `Would add ${addedCount} new hook(s) to settings.json`);
  } else {
    writeFileSync(SETTINGS_JSON, JSON.stringify(settings, null, 2));
    logAction("HOOKS", `Registered ${addedCount} hook(s) in settings.json`);
  }
}

// Step 4: Symlink CLAUDE.md
function symlinkClaudeMd(dryRun: boolean) {
  if (!existsSync(IRA_CLAUDE_MD)) {
    log(`Warning: IRA CLAUDE.md not found at ${IRA_CLAUDE_MD}`);
    return;
  }

  // Ensure ~/.claude/ exists
  if (!existsSync(CLAUDE_DIR)) {
    if (!dryRun) {
      mkdirSync(CLAUDE_DIR, { recursive: true });
    }
  }

  // Check if already correctly linked
  if (existsSync(CLAUDE_MD)) {
    try {
      const stat = lstatSync(CLAUDE_MD);
      if (stat.isSymbolicLink()) {
        const target = readFileSync(CLAUDE_MD, "utf-8"); // just to check it resolves
        const resolvedTarget = resolve(dirname(CLAUDE_MD), execSync(`readlink "${CLAUDE_MD}"`).toString().trim());
        if (resolvedTarget === IRA_CLAUDE_MD) {
          logAction("EXISTS", `${CLAUDE_MD} already symlinked to IRA`);
          return;
        }
      }
    } catch {
      // Fall through to backup + relink
    }

    // Backup existing file
    const backupPath = `${CLAUDE_MD}.backup`;
    if (dryRun) {
      logAction("BACKUP", `${CLAUDE_MD} -> ${backupPath}`);
    } else {
      execSync(`cp -a "${CLAUDE_MD}" "${backupPath}"`);
      rmSync(CLAUDE_MD);
      logAction("BACKUP", `${CLAUDE_MD} -> ${backupPath}`);
    }
  }

  if (dryRun) {
    logAction("SYMLINK", `${CLAUDE_MD} -> ${IRA_CLAUDE_MD}`);
  } else {
    execSync(`ln -s "${IRA_CLAUDE_MD}" "${CLAUDE_MD}"`);
    logAction("SYMLINK", `${CLAUDE_MD} -> ${IRA_CLAUDE_MD}`);
  }
}

// Step 4b: Symlink skills into ~/.claude/skills/ so Claude Code discovers them.
// Each ira/skills/<name>/ becomes ~/.claude/skills/<name> -> ira/skills/<name>.
// Idempotent: skips already-correct links, backs up unrelated dirs/files.
function symlinkSkills(dryRun: boolean) {
  if (!existsSync(IRA_SKILLS_DIR)) {
    log(`Warning: ${IRA_SKILLS_DIR} not found, skipping skill linking`);
    return;
  }

  if (!existsSync(CLAUDE_SKILLS_DIR)) {
    if (dryRun) {
      logAction("MKDIR", CLAUDE_SKILLS_DIR);
    } else {
      mkdirSync(CLAUDE_SKILLS_DIR, { recursive: true });
    }
  }

  const skills = readdirSync(IRA_SKILLS_DIR).filter((name) => {
    try {
      return lstatSync(join(IRA_SKILLS_DIR, name)).isDirectory();
    } catch {
      return false;
    }
  });

  for (const name of skills) {
    const src = join(IRA_SKILLS_DIR, name);
    const dest = join(CLAUDE_SKILLS_DIR, name);

    if (existsSync(dest)) {
      try {
        const stat = lstatSync(dest);
        if (stat.isSymbolicLink()) {
          const target = execSync(`readlink "${dest}"`).toString().trim();
          const resolved = resolve(dirname(dest), target);
          if (resolved === src) {
            logAction("EXISTS", `skills/${name} (already linked)`);
            continue;
          }
        }
      } catch {
        // fall through to backup
      }

      const backupPath = `${dest}.backup`;
      if (dryRun) {
        logAction("BACKUP", `skills/${name} -> ${name}.backup`);
      } else {
        execSync(`mv "${dest}" "${backupPath}"`);
        logAction("BACKUP", `skills/${name} -> ${name}.backup`);
      }
    }

    if (dryRun) {
      logAction("SYMLINK", `skills/${name} -> ${src}`);
    } else {
      execSync(`ln -s "${src}" "${dest}"`);
      logAction("SYMLINK", `skills/${name} -> ${src}`);
    }
  }
}

// Step 5: Create default config
function createDefaultConfig(dryRun: boolean) {
  const configDir = join(HOME, ".config", "ira");
  const configFile = join(configDir, "config.jsonc");

  if (existsSync(configFile)) {
    logAction("EXISTS", configFile);
    return;
  }

  const defaultConfig = `{
  // Model overrides per agent (optional)
  "agents": {},
  // Feature flags
  "features": {
    "ralph": true,
    "ultrawork": true,
    "anti-slop": true,
    "tmux": true
  },
  // TELOS integration
  "telos": {
    "enabled": true,
    "path": "~/.ira/telos/"
  },
  // Learning
  "learning": {
    "auto-capture-ratings": true,
    "failure-dump-threshold": 3
  },
  // External integrations
  "integrations": {
    // Absolute path to ira-memory project (optional, enables DB-backed session memory)
    // Can also be set via IRA_MEMORY_PROJECT env var
    "memoryProject": null
  }
}
`;

  if (dryRun) {
    logAction("CREATE", configFile);
  } else {
    mkdirSync(configDir, { recursive: true });
    writeFileSync(configFile, defaultConfig);
    logAction("CREATED", configFile);
  }
}

// Step 6: Run bun install if needed
function ensureDependencies(dryRun: boolean) {
  const nodeModules = join(IRA_DIR, "node_modules");

  if (existsSync(nodeModules)) {
    logAction("EXISTS", "node_modules/ already present");
    return;
  }

  if (dryRun) {
    logAction("INSTALL", "Would run bun install");
  } else {
    logAction("INSTALL", "Running bun install...");
    execSync("bun install", { cwd: IRA_DIR, stdio: "inherit" });
    logAction("INSTALLED", "Dependencies installed");
  }
}

async function main() {
  const args = parseArgs();

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  console.log("\n========================================");
  console.log("  IRA — First-Time Setup");
  console.log("========================================\n");

  if (args.dryRun) {
    console.log("  [DRY RUN — no changes will be made]\n");
  }

  // Verify IRA project
  if (!existsSync(IRA_CLAUDE_MD)) {
    console.error(`IRA CLAUDE.md not found at ${IRA_CLAUDE_MD}`);
    console.error("Run this script from the IRA project directory.");
    process.exit(1);
  }

  // Step 1
  console.log("Step 1: Creating .ira/ directory structure...");
  createDirectoryStructure(args.dryRun);
  console.log("");

  // Step 2
  console.log("Step 2: Generating boundaries.json from agent frontmatter...");
  generateBoundaries(args.dryRun);
  console.log("");

  // Step 3
  console.log("Step 3: Registering IRA hooks in settings.json...");
  registerHooks(args.dryRun);
  console.log("");

  // Step 4: Rebrand PAI→IRA in settings.json (idempotent — skips if already clean)
  console.log("Step 4: Rebranding settings.json (PAI→IRA)...");
  rebrandSettingsJson(args.dryRun, logAction);
  console.log("");

  // Step 5: Rebrand statusline script (idempotent — skips if not present or already clean)
  console.log("Step 5: Updating statusline...");
  rebrandStatusline(args.dryRun, logAction);
  console.log("");

  // Step 6: Migrate .env from PAI config to IRA config
  console.log("Step 6: Migrating config .env...");
  migrateConfigEnv(args.dryRun, logAction);
  console.log("");

  // Step 7
  console.log("Step 7: Symlinking CLAUDE.md...");
  symlinkClaudeMd(args.dryRun);
  console.log("");

  // Step 7b
  console.log("Step 7b: Symlinking skills into ~/.claude/skills/...");
  symlinkSkills(args.dryRun);
  console.log("");

  // Step 8
  console.log("Step 8: Creating default config...");
  createDefaultConfig(args.dryRun);
  console.log("");

  // Step 9
  console.log("Step 9: Checking dependencies...");
  ensureDependencies(args.dryRun);
  console.log("");

  // Summary
  console.log("========================================");
  if (args.dryRun) {
    console.log("  DRY RUN complete. No changes made.");
    console.log("  Run without --dry-run to apply.");
  } else {
    console.log("  IRA setup complete.");
    console.log("");
    console.log("  Directory:  .ira/ created in " + process.cwd());
    console.log("  Boundaries: .ira/boundaries.json generated");
    console.log("  Hooks:      Registered in ~/.claude/settings.json");
    console.log("  Settings:   PAI references rebranded to IRA");
    console.log("  CLAUDE.md:  Symlinked to IRA");
    console.log("  Config:     ~/.config/ira/config.jsonc");
    console.log("");
    console.log("  Restart Claude Code to apply changes.");
  }
  console.log("========================================\n");
}

main().catch((err) => {
  console.error("Setup failed:", err.message);
  process.exit(1);
});
