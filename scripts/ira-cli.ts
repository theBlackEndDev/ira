#!/usr/bin/env bun
/**
 * IRA CLI — Tmux session manager for persistent Claude Code work
 *
 * Commands:
 *   ira tmux start [session-name] [--cwd path]   Start a new IRA tmux session
 *   ira tmux attach [session-name]                Attach to an existing session
 *   ira tmux list                                 List all IRA sessions
 *   ira tmux kill [session-name]                  Kill an IRA session
 *   ira team N:agent "prompt"                     Launch N panes with agent prompt
 *   ira status                                    Show IRA state and ISC progress
 *   ira help                                      Show usage information
 */

import { execSync, spawnSync } from "child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { basename, join, resolve } from "path";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(msg: string) {
  console.log(`  ${msg}`);
}

function logError(msg: string) {
  console.error(`  Error: ${msg}`);
}

function die(msg: string): never {
  logError(msg);
  process.exit(1);
}

function tmuxInstalled(): boolean {
  const result = spawnSync("which", ["tmux"], { stdio: "pipe" });
  return result.status === 0;
}

function claudeInstalled(): boolean {
  const result = spawnSync("which", ["claude"], { stdio: "pipe" });
  return result.status === 0;
}

function iraSessions(): { name: string; info: string }[] {
  const result = spawnSync("tmux", ["list-sessions", "-F", "#{session_name}\t#{session_path}\t#{session_created}\t#{session_attached}"], {
    stdio: "pipe",
    encoding: "utf-8",
  });

  if (result.status !== 0) return [];

  return result.stdout
    .trim()
    .split("\n")
    .filter((line) => line.startsWith("ira-"))
    .map((line) => {
      const [name, ...rest] = line.split("\t");
      return { name, info: rest.join("\t") };
    });
}

function sessionExists(name: string): boolean {
  const result = spawnSync("tmux", ["has-session", "-t", name], { stdio: "pipe" });
  return result.status === 0;
}

function prefixName(name: string): string {
  return name.startsWith("ira-") ? name : `ira-${name}`;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function cmdTmuxStart(args: string[]) {
  if (!tmuxInstalled()) die("tmux is required. Install with: sudo apt install tmux");
  if (!claudeInstalled()) die("claude CLI not found. Install Claude Code first.");

  let sessionName: string | undefined;
  let cwd = process.env.IRA_CALLER_CWD || process.cwd();

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--cwd" && args[i + 1]) {
      cwd = resolve(args[++i]);
    } else if (!args[i].startsWith("-")) {
      sessionName = args[i];
    }
  }

  if (!sessionName) {
    sessionName = basename(cwd);
  }

  const fullName = prefixName(sessionName);

  if (sessionExists(fullName)) {
    log(`Session "${fullName}" already exists. Use: ira tmux attach ${sessionName}`);
    return;
  }

  if (!existsSync(cwd)) {
    die(`Directory does not exist: ${cwd}`);
  }

  execSync(`tmux new-session -d -s "${fullName}" -c "${cwd}" "claude"`, { stdio: "inherit" });
  log(`Created session "${fullName}" in ${cwd}`);
  log(`Attaching...`);
  execSync(`tmux attach-session -t "${fullName}"`, { stdio: "inherit" });
}

function cmdTmuxAttach(args: string[]) {
  if (!tmuxInstalled()) die("tmux is required. Install with: sudo apt install tmux");

  const sessions = iraSessions();

  if (sessions.length === 0) {
    die("No IRA sessions running. Start one with: ira tmux start");
  }

  let targetName: string;

  if (args.length > 0 && !args[0].startsWith("-")) {
    targetName = prefixName(args[0]);
  } else if (sessions.length === 1) {
    targetName = sessions[0].name;
  } else {
    console.log("\n  Multiple IRA sessions found. Specify one:\n");
    for (const s of sessions) {
      log(`  ${s.name}`);
    }
    console.log("");
    log("Usage: ira tmux attach <session-name>");
    return;
  }

  if (!sessionExists(targetName)) {
    logError(`Session "${targetName}" not found.`);
    console.log("\n  Available sessions:");
    for (const s of sessions) {
      log(`  ${s.name}`);
    }
    return;
  }

  execSync(`tmux attach-session -t "${targetName}"`, { stdio: "inherit" });
}

function cmdTmuxList() {
  if (!tmuxInstalled()) die("tmux is required. Install with: sudo apt install tmux");

  const result = spawnSync(
    "tmux",
    ["list-sessions", "-F", "#{session_name}\t#{pane_current_path}\t#{session_created}\t#{session_attached}"],
    { stdio: "pipe", encoding: "utf-8" }
  );

  if (result.status !== 0) {
    log("No tmux sessions running.");
    return;
  }

  const lines = result.stdout
    .trim()
    .split("\n")
    .filter((line) => line.startsWith("ira-"));

  if (lines.length === 0) {
    log("No IRA sessions running.");
    return;
  }

  console.log("");
  console.log("  " + "SESSION".padEnd(24) + "DIRECTORY".padEnd(40) + "CREATED".padEnd(22) + "STATUS");
  console.log("  " + "-".repeat(24) + "-".repeat(40) + "-".repeat(22) + "-".repeat(10));

  for (const line of lines) {
    const [name, dir, createdTs, attached] = line.split("\t");
    const created = createdTs ? new Date(parseInt(createdTs) * 1000).toLocaleString() : "unknown";
    const status = attached === "1" ? "attached" : "detached";
    console.log("  " + name.padEnd(24) + (dir || "?").padEnd(40) + created.padEnd(22) + status);
  }

  console.log("");
}

function cmdTmuxKill(args: string[]) {
  if (!tmuxInstalled()) die("tmux is required. Install with: sudo apt install tmux");

  const sessions = iraSessions();

  if (sessions.length === 0) {
    die("No IRA sessions running.");
  }

  let targetName: string;

  if (args.length > 0 && !args[0].startsWith("-")) {
    targetName = prefixName(args[0]);
  } else if (sessions.length === 1) {
    targetName = sessions[0].name;
  } else {
    console.log("\n  Multiple IRA sessions found. Specify one to kill:\n");
    for (const s of sessions) {
      log(`  ${s.name}`);
    }
    console.log("");
    log("Usage: ira tmux kill <session-name>");
    return;
  }

  if (!sessionExists(targetName)) {
    logError(`Session "${targetName}" not found.`);
    console.log("\n  Available sessions:");
    for (const s of sessions) {
      log(`  ${s.name}`);
    }
    return;
  }

  // Confirm
  log(`Killing session "${targetName}"...`);
  const result = spawnSync("tmux", ["kill-session", "-t", targetName], { stdio: "pipe" });
  if (result.status === 0) {
    log(`Session "${targetName}" killed.`);
  } else {
    die(`Failed to kill session "${targetName}".`);
  }
}

function cmdTeam(args: string[]) {
  if (!tmuxInstalled()) die("tmux is required. Install with: sudo apt install tmux");
  if (!claudeInstalled()) die("claude CLI not found. Install Claude Code first.");

  // Parse N:agent
  const spec = args[0];
  const prompt = args.slice(1).join(" ");

  if (!spec || !prompt) {
    die("Usage: ira team N:agent \"prompt\"\n  Example: ira team 3:executor \"fix all TypeScript errors\"");
  }

  const match = spec.match(/^(\d+):(\w+)$/);
  if (!match) {
    die(`Invalid team spec "${spec}". Expected format: N:agent (e.g., 3:executor)`);
  }

  const paneCount = parseInt(match[1]);
  const agent = match[2];

  if (paneCount < 1 || paneCount > 10) {
    die("Pane count must be between 1 and 10.");
  }

  const windowName = `ira-team-${agent}`;
  const claudeCmd = `claude --prompt "[${agent}] ${prompt.replace(/"/g, '\\"')}"`;

  // Create a new tmux session or window with the first pane
  if (!sessionExists("ira-team")) {
    execSync(`tmux new-session -d -s "ira-team" -n "${windowName}" "${claudeCmd}"`, { stdio: "pipe" });
  } else {
    execSync(`tmux new-window -t "ira-team" -n "${windowName}" "${claudeCmd}"`, { stdio: "pipe" });
  }

  // Split for remaining panes
  for (let i = 1; i < paneCount; i++) {
    execSync(`tmux split-window -t "ira-team:${windowName}" "${claudeCmd}"`, { stdio: "pipe" });
    execSync(`tmux select-layout -t "ira-team:${windowName}" tiled`, { stdio: "pipe" });
  }

  log(`Created ${paneCount} panes running [${agent}] in session "ira-team", window "${windowName}"`);
  log("Attaching...");
  execSync(`tmux attach-session -t "ira-team:${windowName}"`, { stdio: "inherit" });
}

function cmdStatus() {
  const base = process.env.IRA_CALLER_CWD || process.cwd();
  const stateDir = join(base, ".ira", "state");
  const workDir = join(base, ".ira", "work");

  console.log("\n  IRA Status");
  console.log("  " + "=".repeat(40));

  // Active modes
  if (existsSync(stateDir)) {
    const stateFiles = readdirSync(stateDir).filter((f) => f.endsWith(".json"));

    if (stateFiles.length > 0) {
      console.log("\n  Active Modes:");
      for (const file of stateFiles) {
        const name = file.replace("-state.json", "").replace(".json", "");
        try {
          const data = JSON.parse(readFileSync(join(stateDir, file), "utf-8"));
          const active = data.active ?? data.enabled ?? true;
          log(`  ${active ? "ON " : "OFF"} ${name}`);
        } catch {
          log(`  ???  ${name} (unreadable)`);
        }
      }
    } else {
      log("\n  No active modes.");
    }
  } else {
    log("\n  No .ira/state/ directory found.");
  }

  // ISC progress from work files
  if (existsSync(workDir)) {
    const workFiles = readdirSync(workDir).filter((f) => f.endsWith(".md") || f.endsWith(".json"));

    if (workFiles.length > 0) {
      console.log("\n  Work Items:");
      for (const file of workFiles) {
        const filePath = join(workDir, file);
        try {
          const content = readFileSync(filePath, "utf-8");

          if (file.endsWith(".json")) {
            const data = JSON.parse(content);
            const total = data.isc_total ?? data.total ?? 0;
            const done = data.isc_done ?? data.done ?? 0;
            log(`  ${file}: ${done}/${total} ISC complete`);
          } else {
            // Parse markdown checkboxes
            const checked = (content.match(/- \[x\]/gi) || []).length;
            const unchecked = (content.match(/- \[ \]/g) || []).length;
            const total = checked + unchecked;
            if (total > 0) {
              const pct = Math.round((checked / total) * 100);
              log(`  ${file}: ${checked}/${total} ISC complete (${pct}%)`);
            } else {
              log(`  ${file}: no ISC criteria found`);
            }
          }
        } catch {
          log(`  ${file}: unreadable`);
        }
      }
    }
  }

  // Active tmux sessions
  if (tmuxInstalled()) {
    const sessions = iraSessions();
    if (sessions.length > 0) {
      console.log("\n  Active Sessions:");
      for (const s of sessions) {
        log(`  ${s.name}`);
      }
    }
  }

  console.log("");
}

function cmdHelp() {
  console.log(`
IRA CLI — Tmux session manager for persistent Claude Code work

Usage: ira <command> [options]

Session Management:
  ira tmux start [name] [--cwd path]   Create a new IRA tmux session
                                        Default name: basename of working directory
                                        Sessions are prefixed with "ira-"
  ira tmux attach [name]               Attach to an existing IRA session
                                        If only one session exists, attaches automatically
  ira tmux list                        List all IRA tmux sessions
  ira tmux kill [name]                 Kill an IRA tmux session

Team:
  ira team N:agent "prompt"            Launch N panes each running claude with agent prompt
                                        Example: ira team 3:executor "fix TypeScript errors"

Status:
  ira status                           Show active modes, ISC progress, and sessions

Help:
  ira help                             Show this help message

Examples:
  ira tmux start foundry --cwd ~/projects/foundry
  ira tmux start                       # uses current directory basename
  ira tmux attach foundry
  ira tmux list
  ira tmux kill foundry
  ira team 4:executor "run all tests and fix failures"
  ira status
`);
}

// ---------------------------------------------------------------------------
// Main router
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "help" || args[0] === "--help") {
    cmdHelp();
    return;
  }

  const command = args[0];

  switch (command) {
    case "tmux": {
      const subcommand = args[1];
      const subArgs = args.slice(2);

      switch (subcommand) {
        case "start":
          cmdTmuxStart(subArgs);
          break;
        case "attach":
          cmdTmuxAttach(subArgs);
          break;
        case "list":
        case "ls":
          cmdTmuxList();
          break;
        case "kill":
          cmdTmuxKill(subArgs);
          break;
        default:
          if (!subcommand) {
            die("Missing subcommand. Usage: ira tmux <start|attach|list|kill>");
          }
          die(`Unknown tmux subcommand: ${subcommand}`);
      }
      break;
    }

    case "team":
      cmdTeam(args.slice(1));
      break;

    case "status":
      cmdStatus();
      break;

    default:
      die(`Unknown command: ${command}\nRun "ira help" for usage.`);
  }
}

main();
