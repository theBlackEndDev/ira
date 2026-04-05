#!/usr/bin/env bun
/**
 * IRA — Uninstall PAI and switch to IRA
 *
 * This script:
 * 1. Backs up the entire ~/.claude/PAI/ to a tarball
 * 2. Backs up ~/.claude/CLAUDE.md
 * 3. Removes PAI system files
 * 4. Replaces ~/.claude/CLAUDE.md with IRA's version (symlink)
 * 5. Removes PAI hooks from settings.json
 * 6. Registers IRA hooks in settings.json
 * 7. Preserves ~/.claude/MEMORY/ as archive
 * 8. Preserves ~/.claude/skills/ (user may still want them)
 *
 * Safety:
 * - Creates timestamped backup before any destructive action
 * - --dry-run mode shows what would happen
 * - --restore mode reverts from backup
 *
 * Usage:
 *   bun run scripts/uninstall-pai.ts [options]
 *
 * Options:
 *   --dry-run      Show what would happen without doing it
 *   --restore      Restore PAI from most recent backup
 *   --keep-skills  Don't remove PAI skills directory
 *   --ira-path     Path to IRA project (default: auto-detect)
 *   --help         Show help
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync, statSync } from "fs";
import { join, resolve, dirname } from "path";
import { execSync } from "child_process";
import { homedir } from "os";

const HOME = homedir();
const CLAUDE_DIR = join(HOME, ".claude");
const PAI_DIR = join(CLAUDE_DIR, "PAI");
const CLAUDE_MD = join(CLAUDE_DIR, "CLAUDE.md");
const SETTINGS_JSON = join(CLAUDE_DIR, "settings.json");
const MEMORY_DIR = join(CLAUDE_DIR, "MEMORY");
const SKILLS_DIR = join(CLAUDE_DIR, "skills");
const BACKUP_DIR = join(CLAUDE_DIR, "backups");

// Auto-detect IRA path (directory containing this script's parent)
const SCRIPT_DIR = dirname(new URL(import.meta.url).pathname);
const IRA_DIR = resolve(SCRIPT_DIR, "..");
const IRA_CLAUDE_MD = join(IRA_DIR, "CLAUDE.md");
const IRA_HOOKS_JSON = join(IRA_DIR, "hooks", "hooks.json");

interface Args {
  dryRun: boolean;
  restore: boolean;
  keepSkills: boolean;
  iraPath: string;
  help: boolean;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes("--dry-run"),
    restore: args.includes("--restore"),
    keepSkills: args.includes("--keep-skills"),
    iraPath: args.find((a) => a.startsWith("--ira-path="))?.split("=")[1] ?? IRA_DIR,
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
IRA — Uninstall PAI and Switch to IRA

Usage: bun run scripts/uninstall-pai.ts [options]

Options:
  --dry-run      Show what would happen without doing it
  --restore      Restore PAI from most recent backup
  --keep-skills  Don't remove PAI skills directory
  --ira-path=X   Path to IRA project (default: auto-detect)
  --help         Show this help

What this does:
  1. Backs up ~/.claude/PAI/ → ~/.claude/backups/pai-YYYYMMDD-HHMMSS.tar.gz
  2. Backs up ~/.claude/CLAUDE.md → included in backup
  3. Removes ~/.claude/PAI/ (system files only)
  4. Replaces ~/.claude/CLAUDE.md with symlink to IRA's CLAUDE.md
  5. Removes PAI hooks from settings.json
  6. Registers IRA hooks in settings.json
  7. Preserves ~/.claude/MEMORY/ (already migrated by migrate-from-pai.ts)
  8. Optionally preserves ~/.claude/skills/ (--keep-skills)

Rollback:
  bun run scripts/uninstall-pai.ts --restore
`);
}

function createBackup(dryRun: boolean): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "-").slice(0, 19);
  const backupName = `pai-${timestamp}`;
  const backupPath = join(BACKUP_DIR, `${backupName}.tar.gz`);

  if (dryRun) {
    logAction("BACKUP", `Would create ${backupPath}`);
    return backupPath;
  }

  mkdirSync(BACKUP_DIR, { recursive: true });

  // Build list of things to back up
  const targets: string[] = [];
  if (existsSync(PAI_DIR)) targets.push("PAI");
  if (existsSync(CLAUDE_MD)) targets.push("CLAUDE.md");
  if (existsSync(SETTINGS_JSON)) targets.push("settings.json");
  if (existsSync(SKILLS_DIR)) targets.push("skills");

  if (targets.length === 0) {
    log("Nothing to back up — PAI may not be installed");
    return "";
  }

  const tarTargets = targets.map((t) => `-C "${CLAUDE_DIR}" "${t}"`).join(" ");
  execSync(`tar -czf "${backupPath}" ${tarTargets}`, { stdio: "pipe" });

  const size = statSync(backupPath).size;
  logAction("BACKUP", `${backupPath} (${(size / 1024).toFixed(0)} KB)`);
  return backupPath;
}

function restoreFromBackup() {
  if (!existsSync(BACKUP_DIR)) {
    console.error("No backups found at", BACKUP_DIR);
    process.exit(1);
  }

  const backups = readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith("pai-") && f.endsWith(".tar.gz"))
    .sort()
    .reverse();

  if (backups.length === 0) {
    console.error("No PAI backups found");
    process.exit(1);
  }

  const latest = backups[0];
  const backupPath = join(BACKUP_DIR, latest);

  console.log(`\nRestoring from: ${latest}\n`);

  // Remove IRA's CLAUDE.md symlink if it exists
  if (existsSync(CLAUDE_MD)) {
    rmSync(CLAUDE_MD);
    logAction("REMOVED", "CLAUDE.md symlink");
  }

  // Extract backup
  execSync(`tar -xzf "${backupPath}" -C "${CLAUDE_DIR}"`, { stdio: "pipe" });
  logAction("RESTORED", `PAI files from ${latest}`);

  // Re-read settings.json and remove IRA hooks
  if (existsSync(SETTINGS_JSON)) {
    const settings = JSON.parse(readFileSync(SETTINGS_JSON, "utf-8"));
    const hooks = settings.hooks ?? {};

    for (const [event, hookList] of Object.entries(hooks)) {
      if (Array.isArray(hookList)) {
        settings.hooks[event] = hookList.filter(
          (entry: any) => !(entry.hooks || []).some(
            (h: any) => h.command?.includes("ira/hooks/")
          )
        );
      }
    }

    writeFileSync(SETTINGS_JSON, JSON.stringify(settings, null, 2));
    logAction("CLEANED", "IRA hooks removed from settings.json");
  }

  console.log("\nPAI restored successfully. Restart Claude Code to apply.\n");
}

function removePAIFiles(dryRun: boolean, keepSkills: boolean) {
  // Remove PAI system directory
  if (existsSync(PAI_DIR)) {
    if (dryRun) {
      logAction("REMOVE", PAI_DIR);
    } else {
      rmSync(PAI_DIR, { recursive: true });
      logAction("REMOVED", PAI_DIR);
    }
  }

  // Remove PAI skills (unless --keep-skills)
  if (!keepSkills && existsSync(SKILLS_DIR)) {
    if (dryRun) {
      logAction("REMOVE", SKILLS_DIR);
    } else {
      rmSync(SKILLS_DIR, { recursive: true });
      logAction("REMOVED", SKILLS_DIR);
    }
  } else if (keepSkills) {
    logAction("KEPT", `${SKILLS_DIR} (--keep-skills)`);
  }
}

function replaceCLAUDEmd(dryRun: boolean, iraPath: string) {
  const iraClaude = join(iraPath, "CLAUDE.md");

  if (!existsSync(iraClaude)) {
    console.error(`IRA CLAUDE.md not found at ${iraClaude}`);
    process.exit(1);
  }

  if (dryRun) {
    logAction("SYMLINK", `${CLAUDE_MD} → ${iraClaude}`);
    return;
  }

  // Remove existing CLAUDE.md
  if (existsSync(CLAUDE_MD)) {
    rmSync(CLAUDE_MD);
  }

  // Create symlink
  execSync(`ln -s "${iraClaude}" "${CLAUDE_MD}"`);
  logAction("SYMLINK", `${CLAUDE_MD} → ${iraClaude}`);
}

function updateSettingsHooks(dryRun: boolean, iraPath: string) {
  const iraHooksPath = join(iraPath, "hooks", "hooks.json");

  if (!existsSync(iraHooksPath)) {
    log("Warning: IRA hooks.json not found, skipping hook registration");
    return;
  }

  if (!existsSync(SETTINGS_JSON)) {
    log("Warning: settings.json not found, skipping hook update");
    return;
  }

  const settings = JSON.parse(readFileSync(SETTINGS_JSON, "utf-8"));
  const iraHooksConfig = JSON.parse(readFileSync(iraHooksPath, "utf-8"));
  const iraHooks = iraHooksConfig.hooks ?? {};

  // Remove PAI hooks (anything referencing PAI paths or known PAI hook names)
  const paiHookPatterns = [
    "PAI",
    "pai",
    "KittyEnv",
    "SessionCleanup",
    "WorkCompletion",
    "RelationshipMemory",
    "UpdateCounts",
    "IntegrityCheck",
    "RatingCapture",
    "UpdateTabTitle",
    "SessionAutoName",
    "LastResponseCache",
    "ResponseTabReset",
    "VoiceCompletion",
    "DocIntegrity",
    "SecurityValidator",
    "AgentExecutionGuard",
    "SkillGuard",
    "PRDSync",
    "QuestionAnswered",
  ];

  const currentHooks = settings.hooks ?? {};

  for (const [event, hookList] of Object.entries(currentHooks)) {
    if (Array.isArray(hookList)) {
      settings.hooks[event] = hookList.filter((h: any) => {
        const cmd = h.command ?? "";
        const name = h.name ?? "";
        return !paiHookPatterns.some(
          (p) => cmd.includes(p) || name.includes(p)
        );
      });
    }
  }

  if (dryRun) {
    logAction("HOOKS", "Would remove PAI hooks from settings.json");
  } else {
    logAction("HOOKS", "Removed PAI hooks from settings.json");
  }

  // Add IRA hooks (format: { matcher, hooks: [{ type, command, timeout }] })
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
            `node ${join(iraPath, "hooks")}/`
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
      }
    }
  }

  if (dryRun) {
    logAction("HOOKS", "Would register IRA hooks in settings.json");
    for (const [event, hookList] of Object.entries(iraHooks)) {
      if (Array.isArray(hookList)) {
        for (const entry of hookList) {
          const cmd = (entry as any).hooks?.[0]?.command ?? "(no command)";
          logAction("", `  ${event}: ${cmd}`);
        }
      }
    }
  } else {
    writeFileSync(SETTINGS_JSON, JSON.stringify(settings, null, 2));
    logAction("HOOKS", "Registered IRA hooks in settings.json");
  }
}

function removeLoadAtStartup(dryRun: boolean) {
  if (!existsSync(SETTINGS_JSON)) return;

  const settings = JSON.parse(readFileSync(SETTINGS_JSON, "utf-8"));
  if (!Array.isArray(settings.loadAtStartup)) {
    logAction("STARTUP", "Not an array, skipping");
    return;
  }
  const startup = settings.loadAtStartup;

  // Remove PAI-related startup files
  const filtered = startup.filter(
    (f: string) => !f.includes("PAI") && !f.includes("pai") && f !== "_docs" && f !== "files"
  );

  if (filtered.length !== startup.length) {
    if (dryRun) {
      logAction("STARTUP", `Would remove ${startup.length - filtered.length} PAI startup entries`);
    } else {
      settings.loadAtStartup = filtered;
      writeFileSync(SETTINGS_JSON, JSON.stringify(settings, null, 2));
      logAction("STARTUP", `Removed ${startup.length - filtered.length} PAI startup entries`);
    }
  }
}

async function main() {
  const args = parseArgs();

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  if (args.restore) {
    restoreFromBackup();
    process.exit(0);
  }

  console.log("\n========================================");
  console.log("  IRA — Uninstall PAI & Switch to IRA");
  console.log("========================================\n");

  if (args.dryRun) {
    console.log("  [DRY RUN — no changes will be made]\n");
  }

  // Verify IRA exists
  if (!existsSync(join(args.iraPath, "CLAUDE.md"))) {
    console.error(`IRA not found at ${args.iraPath}`);
    console.error("Use --ira-path=/path/to/ira to specify location");
    process.exit(1);
  }

  // Verify PAI exists
  if (!existsSync(PAI_DIR) && !existsSync(CLAUDE_MD)) {
    console.log("PAI does not appear to be installed. Nothing to uninstall.");
    console.log("Run the setup script to install IRA: bun run scripts/setup.ts");
    process.exit(0);
  }

  // Step 1: Backup
  console.log("Step 1: Creating backup...");
  const backupPath = createBackup(args.dryRun);
  console.log("");

  // Step 2: Remove PAI files
  console.log("Step 2: Removing PAI system files...");
  removePAIFiles(args.dryRun, args.keepSkills);
  console.log("");

  // Step 3: Replace CLAUDE.md
  console.log("Step 3: Replacing CLAUDE.md with IRA...");
  replaceCLAUDEmd(args.dryRun, args.iraPath);
  console.log("");

  // Step 4: Update hooks
  console.log("Step 4: Updating hooks in settings.json...");
  updateSettingsHooks(args.dryRun, args.iraPath);
  console.log("");

  // Step 5: Clean startup files
  console.log("Step 5: Cleaning startup configuration...");
  removeLoadAtStartup(args.dryRun);
  console.log("");

  // Summary
  console.log("========================================");
  if (args.dryRun) {
    console.log("  DRY RUN complete. No changes made.");
    console.log("  Run without --dry-run to apply.");
  } else {
    console.log("  PAI uninstalled. IRA is now active.");
    console.log("");
    console.log("  Backup at: " + backupPath);
    console.log("  Restore:   bun run scripts/uninstall-pai.ts --restore");
    console.log("");
    console.log("  ~/.claude/MEMORY/ preserved (already migrated)");
    if (args.keepSkills) {
      console.log("  ~/.claude/skills/ preserved (--keep-skills)");
    }
    console.log("");
    console.log("  Restart Claude Code to apply changes.");
  }
  console.log("========================================\n");
}

main().catch((err) => {
  console.error("Uninstall failed:", err.message);
  process.exit(1);
});
