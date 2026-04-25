/**
 * Claude Code install adapter.
 *
 * Encapsulates all Claude-specific install logic extracted from setup.ts.
 * Behavior is byte-identical to the original monolithic setup — only the
 * location has changed. setup.ts delegates here instead of calling the old
 * top-level functions directly.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  lstatSync,
  rmSync,
  readdirSync,
} from "fs";
import { join, resolve, dirname } from "path";
import { execSync } from "child_process";
import { homedir } from "os";
import { execFileSync } from "child_process";
import type { TargetAdapter, InstallOpts } from "./types.ts";
import { rebrandSettingsJson, rebrandStatusline, migrateConfigEnv } from "../rebrand.ts";

const HOME = homedir();
const CLAUDE_DIR = join(HOME, ".claude");
const CLAUDE_MD = join(CLAUDE_DIR, "CLAUDE.md");
const SETTINGS_JSON = join(CLAUDE_DIR, "settings.json");
const CLAUDE_SKILLS_DIR = join(CLAUDE_DIR, "skills");

export class ClaudeAdapter implements TargetAdapter {
  readonly name = "claude" as const;

  detect(): boolean {
    try {
      execFileSync("which", ["claude"], { stdio: "pipe" });
      return true;
    } catch {
      return false;
    }
  }

  install(opts: InstallOpts): void {
    const { dryRun, iraDir } = opts;

    function log(msg: string) {
      console.log(`  ${msg}`);
    }

    function logAction(action: string, detail: string) {
      console.log(`  ${action.padEnd(12)} ${detail}`);
    }

    const IRA_CLAUDE_MD = join(iraDir, "CLAUDE.md");
    const IRA_HOOKS_JSON = join(iraDir, "hooks", "hooks.json");
    const AGENTS_DIR = join(iraDir, "agents");
    const IRA_SKILLS_DIR = join(iraDir, "skills");

    // ── Step 1: Create .ira/ directory structure ──────────────────────────────
    console.log("Step 1: Creating .ira/ directory structure...");
    {
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
    console.log("");

    // ── Step 2: Generate boundaries.json ─────────────────────────────────────
    console.log("Step 2: Generating boundaries.json from agent frontmatter...");
    {
      const base = process.cwd();
      const boundariesFile = join(base, ".ira", "boundaries.json");

      if (!existsSync(AGENTS_DIR)) {
        log("Warning: agents/ directory not found, skipping boundaries generation");
      } else {
        const agentFiles = readdirSync(AGENTS_DIR).filter((f) => f.endsWith(".md"));
        const agents: Record<string, { disallowedTools: string[] }> = {};

        for (const file of agentFiles) {
          const content = readFileSync(join(AGENTS_DIR, file), "utf-8");

          const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
          if (!fmMatch) continue;

          const frontmatter = fmMatch[1];

          const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
          const name = nameMatch ? nameMatch[1].trim() : file.replace(".md", "");

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
    }
    console.log("");

    // ── Step 3: Register hooks in ~/.claude/settings.json ────────────────────
    console.log("Step 3: Registering IRA hooks in settings.json...");
    {
      if (!existsSync(IRA_HOOKS_JSON)) {
        log("Warning: hooks/hooks.json not found, skipping hook registration");
      } else {
        if (!existsSync(CLAUDE_DIR)) {
          if (!dryRun) mkdirSync(CLAUDE_DIR, { recursive: true });
        }

        let settings: any = { hooks: {} };
        if (existsSync(SETTINGS_JSON)) {
          try {
            settings = JSON.parse(readFileSync(SETTINGS_JSON, "utf-8"));
          } catch {
            log("Warning: settings.json was malformed, creating fresh");
            settings = { hooks: {} };
          }
        }

        if (!settings.hooks) settings.hooks = {};

        const iraHooksConfig = JSON.parse(readFileSync(IRA_HOOKS_JSON, "utf-8"));
        const iraHooks = iraHooksConfig.hooks ?? {};

        let addedCount = 0;

        for (const [event, hookList] of Object.entries(iraHooks)) {
          if (!Array.isArray(hookList)) continue;

          if (!settings.hooks[event]) settings.hooks[event] = [];

          for (const entry of hookList as any[]) {
            const resolvedEntry = {
              ...entry,
              hooks: (entry.hooks || []).map((h: any) => ({
                ...h,
                command: h.command?.replace(
                  /^node hooks\//,
                  `node ${join(iraDir, "hooks")}/`
                ),
              })),
            };

            const resolvedCmd = resolvedEntry.hooks[0]?.command;
            const exists = settings.hooks[event].some(
              (e: any) => e.hooks?.[0]?.command === resolvedCmd
            );

            if (!exists) {
              settings.hooks[event].push(resolvedEntry);
              addedCount++;
              if (dryRun) logAction("ADD", `${event}: ${resolvedCmd}`);
            } else {
              if (dryRun) logAction("EXISTS", `${event}: ${resolvedCmd}`);
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
    }
    console.log("");

    // ── Step 4: Rebrand PAI→IRA in settings.json ─────────────────────────────
    console.log("Step 4: Rebranding settings.json (PAI→IRA)...");
    rebrandSettingsJson(dryRun, logAction);
    console.log("");

    // ── Step 5: Rebrand statusline script ────────────────────────────────────
    console.log("Step 5: Updating statusline...");
    rebrandStatusline(dryRun, logAction);
    console.log("");

    // ── Step 6: Migrate .env from PAI config to IRA config ───────────────────
    console.log("Step 6: Migrating config .env...");
    migrateConfigEnv(dryRun, logAction);
    console.log("");

    // ── Step 7: Symlink CLAUDE.md ─────────────────────────────────────────────
    console.log("Step 7: Symlinking CLAUDE.md...");
    {
      if (!existsSync(IRA_CLAUDE_MD)) {
        log(`Warning: IRA CLAUDE.md not found at ${IRA_CLAUDE_MD}`);
      } else {
        if (!existsSync(CLAUDE_DIR)) {
          if (!dryRun) mkdirSync(CLAUDE_DIR, { recursive: true });
        }

        let alreadyLinked = false;
        if (existsSync(CLAUDE_MD)) {
          try {
            const stat = lstatSync(CLAUDE_MD);
            if (stat.isSymbolicLink()) {
              const resolvedTarget = resolve(
                dirname(CLAUDE_MD),
                execSync(`readlink "${CLAUDE_MD}"`).toString().trim()
              );
              if (resolvedTarget === IRA_CLAUDE_MD) {
                logAction("EXISTS", `${CLAUDE_MD} already symlinked to IRA`);
                alreadyLinked = true;
              }
            }
          } catch {
            // fall through to backup + relink
          }

          if (!alreadyLinked) {
            const backupPath = `${CLAUDE_MD}.backup`;
            if (dryRun) {
              logAction("BACKUP", `${CLAUDE_MD} -> ${backupPath}`);
            } else {
              execSync(`cp -a "${CLAUDE_MD}" "${backupPath}"`);
              rmSync(CLAUDE_MD);
              logAction("BACKUP", `${CLAUDE_MD} -> ${backupPath}`);
            }
          }
        }

        if (!alreadyLinked) {
          if (dryRun) {
            logAction("SYMLINK", `${CLAUDE_MD} -> ${IRA_CLAUDE_MD}`);
          } else {
            execSync(`ln -s "${IRA_CLAUDE_MD}" "${CLAUDE_MD}"`);
            logAction("SYMLINK", `${CLAUDE_MD} -> ${IRA_CLAUDE_MD}`);
          }
        }
      }
    }
    console.log("");

    // ── Step 7b: Symlink skills into ~/.claude/skills/ ────────────────────────
    console.log("Step 7b: Symlinking skills into ~/.claude/skills/...");
    {
      if (!existsSync(IRA_SKILLS_DIR)) {
        log(`Warning: ${IRA_SKILLS_DIR} not found, skipping skill linking`);
      } else {
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
    }
    console.log("");

    // ── Step 8: Create default config ────────────────────────────────────────
    console.log("Step 8: Creating default config...");
    {
      const configDir = join(HOME, ".config", "ira");
      const configFile = join(configDir, "config.jsonc");

      if (existsSync(configFile)) {
        logAction("EXISTS", configFile);
      } else {
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
    }
    console.log("");

    // ── Step 9: Ensure dependencies ──────────────────────────────────────────
    console.log("Step 9: Checking dependencies...");
    {
      const nodeModules = join(iraDir, "node_modules");
      if (existsSync(nodeModules)) {
        logAction("EXISTS", "node_modules/ already present");
      } else if (dryRun) {
        logAction("INSTALL", "Would run bun install");
      } else {
        logAction("INSTALL", "Running bun install...");
        execSync("bun install", { cwd: iraDir, stdio: "inherit" });
        logAction("INSTALLED", "Dependencies installed");
      }
    }
    console.log("");
  }
}
