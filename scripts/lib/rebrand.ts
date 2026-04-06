/**
 * Shared PAI→IRA rebranding utilities for setup and migration scripts.
 * Cross-platform: macOS and Linux (Ubuntu).
 *
 * All file operations use Node.js APIs — no platform-specific shell commands.
 */

import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { execFileSync } from "child_process";

export type LogFn = (action: string, detail: string) => void;

const HOME = homedir();
const CLAUDE_DIR = join(HOME, ".claude");
const SETTINGS_JSON = join(CLAUDE_DIR, "settings.json");
const STATUSLINE_PATH = join(CLAUDE_DIR, "statusline-command.sh");
const PAI_CONFIG_DIR = join(HOME, ".config", "PAI");
const IRA_CONFIG_DIR = join(HOME, ".config", "ira");

// ─── Settings.json Rebranding ────────────────────────────────────────────────

interface RebrandOptions {
  iraRepoUrl?: string;
  iraVersion?: string;
}

/**
 * Rebrand all PAI→IRA references in ~/.claude/settings.json.
 *
 * Handles: env vars, "pai" config section, loadAtStartup, statusLine,
 * systemInstructions, and _docs metadata.
 *
 * Returns number of change groups applied (0 = nothing to do).
 */
export function rebrandSettingsJson(
  dryRun: boolean,
  logAction: LogFn,
  options: RebrandOptions = {}
): number {
  if (!existsSync(SETTINGS_JSON)) {
    logAction("SKIP", "settings.json not found");
    return 0;
  }

  let settings: Record<string, any>;
  try {
    settings = JSON.parse(readFileSync(SETTINGS_JSON, "utf-8"));
  } catch {
    logAction("WARN", "settings.json is malformed, skipping rebrand");
    return 0;
  }

  const raw = JSON.stringify(settings);
  // Use word-boundary check to avoid false positives on substrings like "repair"
  if (!/\bPAI\b/.test(raw) && !/"pai"/.test(raw)) {
    logAction("CLEAN", "No PAI references in settings.json");
    return 0;
  }

  let changes = 0;

  // 1. Env vars: PAI_DIR → IRA_DIR, PAI_CONFIG_DIR → IRA_CONFIG_DIR
  if (settings.env) {
    if (settings.env.PAI_DIR !== undefined) {
      settings.env.IRA_DIR = settings.env.PAI_DIR;
      delete settings.env.PAI_DIR;
      changes++;
    }
    if (settings.env.PAI_CONFIG_DIR !== undefined) {
      settings.env.IRA_CONFIG_DIR = IRA_CONFIG_DIR;
      delete settings.env.PAI_CONFIG_DIR;
      changes++;
    }
  }

  // 2. Rename "pai" config section → "ira"
  if (settings.pai) {
    const iraRepoUrl =
      options.iraRepoUrl ??
      "https://github.com/theBlackEndDev/ira";
    settings.ira = {
      ...settings.pai,
      repoUrl: iraRepoUrl,
      version: options.iraVersion ?? "1.0.0",
    };
    delete settings.pai;
    changes++;
  }

  // 3. Clean loadAtStartup PAI paths
  if (settings.loadAtStartup) {
    if (
      typeof settings.loadAtStartup._docs === "string" &&
      settings.loadAtStartup._docs.includes("PAI")
    ) {
      settings.loadAtStartup._docs = settings.loadAtStartup._docs
        .replace(/PAI_DIR/g, "IRA_DIR")
        .replace(/\bPAI\b/g, "IRA");
      changes++;
    }
    if (Array.isArray(settings.loadAtStartup.files)) {
      const before = settings.loadAtStartup.files.length;
      settings.loadAtStartup.files = settings.loadAtStartup.files.filter(
        (f: string) => !f.includes("PAI") && !f.includes("pai")
      );
      if (settings.loadAtStartup.files.length !== before) changes++;
    }
  }

  // 4. Update statusLine command path
  if (settings.statusLine?.command?.includes("PAI_DIR")) {
    settings.statusLine.command = settings.statusLine.command.replace(
      /\$PAI_DIR/g,
      "$IRA_DIR"
    );
    changes++;
  }

  // 5. Rebrand systemInstructions array
  if (Array.isArray(settings.systemInstructions)) {
    const original = JSON.stringify(settings.systemInstructions);
    settings.systemInstructions = settings.systemInstructions.map((s: string) =>
      typeof s === "string"
        ? s
            .replace(/\bPAI\b/g, "IRA")
            .replace(/\/pai\b/g, "/ira")
            .replace(/\$\{PAI_DIR\}/g, "${IRA_DIR}")
            .replace(/RebuildPAI/g, "RebuildIRA")
        : s
    );
    if (JSON.stringify(settings.systemInstructions) !== original) changes++;
  }

  // 6. Rebrand _docs metadata
  if (settings._docs) {
    const original = JSON.stringify(settings._docs);
    const rebranded = JSON.parse(
      original
        .replace(/\bPAI\b/g, "IRA")
        .replace(/PAI_DIR/g, "IRA_DIR")
    );
    if (JSON.stringify(rebranded) !== original) {
      settings._docs = rebranded;
      changes++;
    }
  }

  if (changes === 0) {
    logAction("CLEAN", "No actionable PAI references found");
    return 0;
  }

  if (dryRun) {
    logAction("REBRAND", `Would update ${changes} PAI reference groups in settings.json`);
  } else {
    writeFileSync(SETTINGS_JSON, JSON.stringify(settings, null, 2));
    logAction("REBRAND", `Updated ${changes} PAI reference groups in settings.json`);
  }

  return changes;
}

// ─── Statusline Rebranding ───────────────────────────────────────────────────

/**
 * Rebrand PAI→IRA in ~/.claude/statusline-command.sh.
 *
 * Handles variable names, color definitions, display text, comments,
 * jq paths, and config fallback paths.
 *
 * Replacement order is carefully sequenced to avoid partial matches.
 * Idempotent — safe to run multiple times.
 */
export function rebrandStatusline(dryRun: boolean, logAction: LogFn): boolean {
  if (!existsSync(STATUSLINE_PATH)) {
    logAction("SKIP", "statusline-command.sh not found");
    return false;
  }

  let content = readFileSync(STATUSLINE_PATH, "utf-8");

  if (!content.includes("PAI")) {
    logAction("CLEAN", "No PAI references in statusline");
    return false;
  }

  // Ordered replacements — longer/more specific patterns first
  const replacements: [RegExp, string][] = [
    // Config/env variable names (longer first to avoid partial match)
    [/PAI_CONFIG_DIR/g, "IRA_CONFIG_DIR"],
    [/PAI_VERSION/g, "IRA_VERSION"],
    [/PAI_DIR/g, "IRA_DIR"],

    // jq paths in settings lookups
    [/\.pai\.version/g, ".ira.version"],
    [/\.pai\.algorithmVersion/g, ".ira.algorithmVersion"],

    // Color variable definitions (= sign distinguishes from use)
    [/PAI_P=/g, "IRA_1="],
    [/PAI_A=/g, "IRA_2="],
    [/PAI_I=/g, "IRA_3="],

    // Color variable references — ${VAR} form
    [/\$\{PAI_P\}/g, "${IRA_1}"],
    [/\$\{PAI_A\}/g, "${IRA_2}"],
    [/\$\{PAI_I\}/g, "${IRA_3}"],

    // Color variable references — $VAR form
    [/\$PAI_P(?=[^_A-Za-z0-9]|$)/g, "$IRA_1"],
    [/\$PAI_A(?=[^_A-Za-z0-9]|$)/g, "$IRA_2"],
    [/\$PAI_I(?=[^_A-Za-z0-9]|$)/g, "$IRA_3"],

    // Other themed color/label variables
    [/PAI_LABEL/g, "IRA_LABEL"],
    [/PAI_CITY/g, "IRA_CITY"],
    [/PAI_STATE/g, "IRA_STATE"],
    [/PAI_TIME/g, "IRA_TIME"],
    [/PAI_WEATHER/g, "IRA_WEATHER"],
    [/PAI_SESSION/g, "IRA_SESSION"],

    // After letter-color vars are renamed, fix the 3-letter display
    [/\$\{IRA_1\}P\$\{IRA_2\}A\$\{IRA_3\}I/g, "${IRA_1}I${IRA_2}R${IRA_3}A"],

    // Text labels in the statusline output
    [/│ PAI STATUSLINE │/g, "│ IRA STATUSLINE │"],
    [/SLATE_500\}PAI:/g, "SLATE_500}IRA:"],
    [/"PAI:"/g, '"IRA:"'],
    [/PAI:\$\{/g, "IRA:${"],

    // Config path fallback
    [/\.config\/PAI/g, ".config/ira"],

    // Comments and headers (catch remaining references)
    [/# PAI Status Line/g, "# IRA Status Line"],
    [/# PAI Branding/g, "# IRA Branding"],
    [/# Get PAI version/g, "# Get IRA version"],
    [/# LINE 0: PAI BRANDING/g, "# LINE 0: IRA BRANDING"],
    [/# Output PAI branding/g, "# Output IRA branding"],
    [/# NOTE: DA_NAME, PAI_VERSION/g, "# NOTE: DA_NAME, IRA_VERSION"],
    [/PAI uses uppercase/g, "IRA uses uppercase"],
  ];

  for (const [pattern, replacement] of replacements) {
    content = content.replace(pattern, replacement);
  }

  if (dryRun) {
    logAction("REBRAND", "Would rebrand statusline-command.sh PAI→IRA");
  } else {
    // Backup before overwrite (once — skip if .bak already exists)
    const bakPath = STATUSLINE_PATH + ".bak";
    if (!existsSync(bakPath)) {
      copyFileSync(STATUSLINE_PATH, bakPath);
      logAction("BACKUP", bakPath);
    }
    writeFileSync(STATUSLINE_PATH, content);
    logAction("REBRAND", "Rebranded statusline-command.sh PAI→IRA");
  }

  return true;
}

// ─── Config .env Migration ───────────────────────────────────────────────────

/**
 * Copy .env from ~/.config/PAI/ to ~/.config/ira/ if it exists and
 * the destination doesn't already have one.
 */
export function migrateConfigEnv(dryRun: boolean, logAction: LogFn): boolean {
  const paiEnv = join(PAI_CONFIG_DIR, ".env");
  const iraEnv = join(IRA_CONFIG_DIR, ".env");

  if (!existsSync(paiEnv)) {
    logAction("SKIP", "No .env in ~/.config/PAI/");
    return false;
  }

  if (existsSync(iraEnv)) {
    logAction("EXISTS", "~/.config/ira/.env already present");
    return false;
  }

  if (dryRun) {
    logAction("COPY", `Would copy ${paiEnv} → ${iraEnv}`);
  } else {
    mkdirSync(IRA_CONFIG_DIR, { recursive: true });
    copyFileSync(paiEnv, iraEnv);
    logAction("COPY", `${paiEnv} → ${iraEnv}`);
  }

  return true;
}

// ─── Platform Detection ──────────────────────────────────────────────────────

/**
 * Detect the current platform for install hints.
 */
export function platformInstallHint(pkg: string): string {
  if (process.platform === "darwin") {
    return `brew install ${pkg}`;
  }
  // Linux — detect package manager without shell expansion (execFileSync, not execSync)
  const managers: [string, string][] = [
    ["apt-get", `sudo apt install ${pkg}`],
    ["dnf", `sudo dnf install ${pkg}`],
    ["pacman", `sudo pacman -S ${pkg}`],
  ];
  for (const [bin, cmd] of managers) {
    try {
      execFileSync("which", [bin], { stdio: "pipe" });
      return cmd;
    } catch {
      // not found, try next
    }
  }
  return `your package manager to install ${pkg}`;
}
