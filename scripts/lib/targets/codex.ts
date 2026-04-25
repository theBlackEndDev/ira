/**
 * Codex CLI install adapter.
 *
 * Installs IRA into OpenAI Codex CLI (~/.codex/):
 *   1. Symlinks skills into ~/.codex/skills/
 *   2. Symlinks ~/.codex/AGENTS.md → <iraDir>/CLAUDE.md (single source of truth)
 *   3. Writes ~/.codex/hooks.json with all 5 IRA events registered
 *   4. Ensures [features].codex_hooks = true in ~/.codex/config.toml
 *
 * Idempotent — safe to run multiple times. All existing files are backed up
 * before overwrite.
 *
 * Reference schema: .ira/debug/codex-schemas/SCHEMA.md
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  lstatSync,
  readdirSync,
} from "fs";
import { join, resolve, dirname } from "path";
import { execSync } from "child_process";
import { execFileSync } from "child_process";
import { homedir } from "os";
import type { TargetAdapter, InstallOpts } from "./types.ts";
import { TomlPatcher } from "../toml-patcher.ts";

const HOME = homedir();
const CODEX_DIR = join(HOME, ".codex");
const CODEX_HOOKS_JSON = join(CODEX_DIR, "hooks.json");
const CODEX_AGENTS_MD = join(CODEX_DIR, "AGENTS.md");
const CODEX_SKILLS_DIR = join(CODEX_DIR, "skills");
const CODEX_CONFIG_TOML = join(CODEX_DIR, "config.toml");

/**
 * Codex event → scripts mapping.
 *
 * Derived from hooks/hooks.json (Claude side) with these adjustments:
 * - SessionStart gets context-loader.mjs (not in Claude's hooks.json but IRA spec requires it)
 * - UserPromptSubmit gets context-loader + keyword-detector + agent-router
 * - PreCompact / context-saver.mjs is excluded (no Codex equivalent)
 * - SessionEnd is excluded (Codex uses Stop with stop_hook_active=false instead)
 * - session-harvester.mjs is registered on Stop (it checks stop_hook_active internally)
 */
const CODEX_EVENT_SCRIPTS: Record<string, Array<{ script: string; timeout: number }>> = {
  SessionStart: [
    { script: "context-loader.mjs", timeout: 5000 },
  ],
  UserPromptSubmit: [
    { script: "context-loader.mjs",   timeout: 5000 },
    { script: "keyword-detector.mjs", timeout: 5000 },
    { script: "agent-router.mjs",     timeout: 15000 },
  ],
  PreToolUse: [
    { script: "boundary-enforcer.mjs", timeout: 3000 },
  ],
  PostToolUse: [
    { script: "state-sync.mjs", timeout: 3000 },
  ],
  Stop: [
    { script: "ralph-loop.mjs",       timeout: 10000 },
    { script: "session-harvester.mjs", timeout: 30000 },
  ],
};

export class CodexAdapter implements TargetAdapter {
  readonly name = "codex" as const;

  detect(): boolean {
    try {
      execFileSync("which", ["codex"], { stdio: "pipe" });
      return true;
    } catch {
      return false;
    }
  }

  install(opts: InstallOpts): void {
    const { dryRun, iraDir } = opts;

    function logAction(action: string, detail: string) {
      console.log(`  ${action.padEnd(12)} ${detail}`);
    }

    const IRA_CLAUDE_MD = join(iraDir, "CLAUDE.md");
    const IRA_SKILLS_DIR = join(iraDir, "skills");
    const HOOKS_SCRIPTS_DIR = join(iraDir, "hooks", "scripts");

    // Ensure ~/.codex/ exists
    if (!existsSync(CODEX_DIR)) {
      if (dryRun) {
        logAction("MKDIR", CODEX_DIR);
      } else {
        mkdirSync(CODEX_DIR, { recursive: true });
        logAction("CREATED", CODEX_DIR);
      }
    }

    // ── 1. Symlink skills ─────────────────────────────────────────────────────
    console.log("Codex Step 1: Symlinking skills into ~/.codex/skills/...");
    {
      if (!existsSync(IRA_SKILLS_DIR)) {
        logAction("WARN", `${IRA_SKILLS_DIR} not found, skipping skill linking`);
      } else {
        if (!existsSync(CODEX_SKILLS_DIR)) {
          if (dryRun) {
            logAction("MKDIR", CODEX_SKILLS_DIR);
          } else {
            mkdirSync(CODEX_SKILLS_DIR, { recursive: true });
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
          const dest = join(CODEX_SKILLS_DIR, name);

          if (existsSync(dest)) {
            try {
              const stat = lstatSync(dest);
              if (stat.isSymbolicLink()) {
                const target = execSync(`readlink "${dest}"`).toString().trim();
                const resolved = resolve(dirname(dest), target);
                if (resolved === src) {
                  logAction("EXISTS", `codex/skills/${name} (already linked)`);
                  continue;
                }
              }
            } catch {
              // fall through to backup
            }

            const backupPath = `${dest}.backup`;
            if (dryRun) {
              logAction("BACKUP", `codex/skills/${name} -> ${name}.backup`);
            } else {
              execSync(`mv "${dest}" "${backupPath}"`);
              logAction("BACKUP", `codex/skills/${name} -> ${name}.backup`);
            }
          }

          if (dryRun) {
            logAction("SYMLINK", `codex/skills/${name} -> ${src}`);
          } else {
            execSync(`ln -s "${src}" "${dest}"`);
            logAction("SYMLINK", `codex/skills/${name} -> ${src}`);
          }
        }
      }
    }
    console.log("");

    // ── 2. Symlink AGENTS.md → IRA's CLAUDE.md ───────────────────────────────
    console.log("Codex Step 2: Symlinking ~/.codex/AGENTS.md...");
    {
      if (!existsSync(IRA_CLAUDE_MD)) {
        logAction("WARN", `IRA CLAUDE.md not found at ${IRA_CLAUDE_MD}, skipping`);
      } else {
        let alreadyLinked = false;

        if (existsSync(CODEX_AGENTS_MD)) {
          try {
            const stat = lstatSync(CODEX_AGENTS_MD);
            if (stat.isSymbolicLink()) {
              const resolvedTarget = resolve(
                dirname(CODEX_AGENTS_MD),
                execSync(`readlink "${CODEX_AGENTS_MD}"`).toString().trim()
              );
              if (resolvedTarget === IRA_CLAUDE_MD) {
                logAction("EXISTS", `${CODEX_AGENTS_MD} already symlinked to IRA`);
                alreadyLinked = true;
              }
            }
          } catch {
            // fall through to backup + relink
          }

          if (!alreadyLinked) {
            const backupPath = `${CODEX_AGENTS_MD}.ira-backup-${Date.now()}`;
            if (dryRun) {
              logAction("BACKUP", `${CODEX_AGENTS_MD} -> ${backupPath}`);
            } else {
              execSync(`cp -a "${CODEX_AGENTS_MD}" "${backupPath}"`);
              execSync(`rm -f "${CODEX_AGENTS_MD}"`);
              logAction("BACKUP", `${CODEX_AGENTS_MD} -> ${backupPath}`);
            }
          }
        }

        if (!alreadyLinked) {
          if (dryRun) {
            logAction("SYMLINK", `${CODEX_AGENTS_MD} -> ${IRA_CLAUDE_MD}`);
          } else {
            try {
              execSync(`ln -s "${IRA_CLAUDE_MD}" "${CODEX_AGENTS_MD}"`);
              logAction("SYMLINK", `${CODEX_AGENTS_MD} -> ${IRA_CLAUDE_MD}`);
            } catch (err: any) {
              // Symlink failed — copy as fallback
              logAction("WARN", `symlink failed (${err.message}), copying instead`);
              if (!dryRun) {
                const content = readFileSync(IRA_CLAUDE_MD, "utf-8");
                writeFileSync(CODEX_AGENTS_MD, content);
                logAction("COPY", `${CODEX_AGENTS_MD} (copy of IRA CLAUDE.md)`);
              }
            }
          }
        }
      }
    }
    console.log("");

    // ── 3. Write ~/.codex/hooks.json ─────────────────────────────────────────
    console.log("Codex Step 3: Writing ~/.codex/hooks.json...");
    {
      // Backup existing hooks.json
      if (existsSync(CODEX_HOOKS_JSON)) {
        const backupPath = `${CODEX_HOOKS_JSON}.ira-backup-${Date.now()}`;
        if (dryRun) {
          logAction("BACKUP", `${CODEX_HOOKS_JSON} -> ${backupPath}`);
        } else {
          execSync(`cp -a "${CODEX_HOOKS_JSON}" "${backupPath}"`);
          logAction("BACKUP", `${CODEX_HOOKS_JSON} -> ${backupPath}`);
        }
      }

      // Build hooks structure — same envelope shape as Claude's hooks.json
      // { hooks: { EventName: [{ hooks: [{ type: "command", command: "...", timeout: N }] }] } }
      const hooksDoc: Record<string, any> = { hooks: {} };

      for (const [event, scriptList] of Object.entries(CODEX_EVENT_SCRIPTS)) {
        hooksDoc.hooks[event] = scriptList.map(({ script, timeout }) => ({
          matcher: "",
          hooks: [
            {
              type: "command",
              command: `node ${join(HOOKS_SCRIPTS_DIR, script)}`,
              timeout,
            },
          ],
        }));
      }

      if (dryRun) {
        logAction("WRITE", CODEX_HOOKS_JSON);
        for (const [event, entries] of Object.entries(hooksDoc.hooks)) {
          for (const entry of entries as any[]) {
            logAction("", `  ${event}: ${entry.hooks[0].command}`);
          }
        }
      } else {
        writeFileSync(CODEX_HOOKS_JSON, JSON.stringify(hooksDoc, null, 2));
        logAction("WROTE", CODEX_HOOKS_JSON);
      }
    }
    console.log("");

    // ── 4. Patch ~/.codex/config.toml — [features].codex_hooks = true ────────
    console.log("Codex Step 4: Patching ~/.codex/config.toml...");
    {
      try {
        const patcher = new TomlPatcher(CODEX_CONFIG_TOML);
        patcher.read();
        patcher.merge({ features: { codex_hooks: true } });
        patcher.write({
          dryRun,
          log: (msg) => console.log(`  ${msg}`),
        });
        if (!dryRun) {
          logAction("OK", `${CODEX_CONFIG_TOML} — [features].codex_hooks = true`);
        }
      } catch (err: any) {
        logAction("WARN", `config.toml patch failed: ${err.message}`);
      }
    }
    console.log("");
  }
}
