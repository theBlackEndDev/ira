#!/usr/bin/env bun
/**
 * IRA — First-time installation script
 *
 * This script:
 * 1. Creates .ira/ directory structure in cwd
 * 2. Generates .ira/boundaries.json from agent frontmatter
 * 3. Registers IRA hooks in the chosen target(s)
 * 4. Rebrands PAI→IRA in settings.json (env vars, config, docs)  [Claude only]
 * 5. Rebrands PAI→IRA in statusline script (if present)          [Claude only]
 * 6. Migrates .env from ~/.config/PAI/ to ~/.config/ira/         [Claude only]
 * 7. Symlinks target CLAUDE.md / AGENTS.md to IRA's CLAUDE.md
 * 8. Creates default config at ~/.config/ira/config.jsonc         [Claude only]
 * 9. Runs bun install if node_modules doesn't exist
 *
 * Cross-platform: macOS and Linux (Ubuntu/Debian, Fedora, Arch)
 *
 * Usage:
 *   bun run scripts/setup.ts [options]
 *
 * Options:
 *   --target <claude|codex|both|auto>
 *             Which CLI to install into (default: claude)
 *   --dry-run Show what would happen without doing it
 *   --help    Show help
 */

import { existsSync } from "fs";
import { join, resolve, dirname } from "path";
import { homedir } from "os";
import { ClaudeAdapter } from "./lib/targets/claude.ts";
import { CodexAdapter } from "./lib/targets/codex.ts";
import { detectTargets } from "./lib/targets/detect.ts";
import type { TargetAdapter } from "./lib/targets/types.ts";

const HOME = homedir();

// Auto-detect IRA path (directory containing this script's parent)
const SCRIPT_DIR = dirname(new URL(import.meta.url).pathname);
const IRA_DIR = resolve(SCRIPT_DIR, "..");
const IRA_CLAUDE_MD = join(IRA_DIR, "CLAUDE.md");

type TargetMode = "claude" | "codex" | "both" | "auto";

interface Args {
  dryRun: boolean;
  help: boolean;
  target: TargetMode;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const targetIdx = args.indexOf("--target");
  let target: TargetMode = "claude";

  if (targetIdx !== -1) {
    const raw = args[targetIdx + 1];
    if (!raw || raw.startsWith("--")) {
      console.error("Error: --target requires a value: claude | codex | both | auto");
      process.exit(1);
    }
    if (raw !== "claude" && raw !== "codex" && raw !== "both" && raw !== "auto") {
      console.error(`Error: unknown target "${raw}". Valid values: claude | codex | both | auto`);
      process.exit(1);
    }
    target = raw as TargetMode;
  }

  return {
    dryRun: args.includes("--dry-run"),
    help: args.includes("--help"),
    target,
  };
}

function log(msg: string) {
  console.log(`  ${msg}`);
}

function showHelp() {
  console.log(`
IRA — First-Time Setup

Usage: bun run scripts/setup.ts [options]

Options:
  --target <mode>  Which CLI to install IRA into (default: claude)
                     claude  Install into Claude Code only (current behavior)
                     codex   Install into OpenAI Codex CLI only
                     both    Install into both Claude Code and Codex CLI
                     auto    Detect installed CLIs and install into all found
  --dry-run        Show what would happen without doing it
  --help           Show this help

What this does (Claude target):
  1. Creates .ira/ directory structure in the current working directory
  2. Generates .ira/boundaries.json from agents/*.md frontmatter
  3. Registers IRA hooks in ~/.claude/settings.json
  4. Rebrands PAI→IRA in settings.json (env vars, config, docs)
  5. Rebrands PAI→IRA in statusline script (if present)
  6. Migrates .env from ~/.config/PAI/ to ~/.config/ira/
  7. Symlinks ~/.claude/CLAUDE.md to IRA's CLAUDE.md
  8. Creates default config at ~/.config/ira/config.jsonc
  9. Runs bun install if node_modules/ doesn't exist

What this does (Codex target):
  1-2. Same directory structure and boundaries generation
  3. Writes ~/.codex/hooks.json with IRA events registered
  4. Symlinks ~/.codex/AGENTS.md to IRA's CLAUDE.md
  5. Symlinks ~/.codex/skills/<name> for each IRA skill
  6. Patches ~/.codex/config.toml to ensure codex_hooks = true
`);
}

/** Resolve a TargetMode into an ordered list of adapters to run. */
function resolveAdapters(mode: TargetMode): TargetAdapter[] {
  const claude = new ClaudeAdapter();
  const codex = new CodexAdapter();

  switch (mode) {
    case "claude":
      return [claude];
    case "codex":
      return [codex];
    case "both":
      return [claude, codex];
    case "auto": {
      const detected = detectTargets();
      if (detected.length === 0) {
        log("Warning: --target auto found neither 'claude' nor 'codex' on PATH.");
        log("         Install at least one CLI and re-run setup.");
        return [];
      }
      return detected.map((t) => (t === "claude" ? claude : codex));
    }
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

  const adapters = resolveAdapters(args.target);

  if (adapters.length === 0) {
    // resolveAdapters already logged the warning for auto-empty case
    process.exit(1);
  }

  console.log(`  Target: ${args.target} → [${adapters.map((a) => a.name).join(", ")}]\n`);

  let successCount = 0;

  for (const adapter of adapters) {
    console.log(`\n--- Installing into: ${adapter.name.toUpperCase()} ---\n`);

    try {
      adapter.install({
        dryRun: args.dryRun,
        iraDir: IRA_DIR,
        log,
      });
      successCount++;
    } catch (err: any) {
      console.error(`\n  ERROR during ${adapter.name} install: ${err.message}`);
      console.error("  Continuing to next target...\n");
    }
  }

  // Summary
  console.log("========================================");
  if (args.dryRun) {
    console.log("  DRY RUN complete. No changes made.");
    console.log("  Run without --dry-run to apply.");
  } else if (successCount === adapters.length) {
    console.log("  IRA setup complete.");
    console.log("");
    for (const adapter of adapters) {
      if (adapter.name === "claude") {
        console.log("  [claude]");
        console.log("    Directory:  .ira/ created in " + process.cwd());
        console.log("    Boundaries: .ira/boundaries.json generated");
        console.log("    Hooks:      Registered in ~/.claude/settings.json");
        console.log("    CLAUDE.md:  Symlinked to IRA");
        console.log("    Config:     ~/.config/ira/config.jsonc");
        console.log("    Restart Claude Code to apply changes.");
      } else if (adapter.name === "codex") {
        console.log("  [codex]");
        console.log("    Hooks:      ~/.codex/hooks.json written");
        console.log("    AGENTS.md:  ~/.codex/AGENTS.md symlinked to IRA");
        console.log("    Skills:     ~/.codex/skills/ symlinked");
        console.log("    Config:     ~/.codex/config.toml patched");
        console.log("    Restart Codex CLI to apply changes.");
      }
    }
  } else {
    console.log(`  Setup completed with errors (${successCount}/${adapters.length} targets succeeded).`);
    console.log("  Check output above for details.");
  }
  console.log("========================================\n");

  if (successCount === 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Setup failed:", err.message);
  process.exit(1);
});
