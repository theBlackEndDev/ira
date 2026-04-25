/**
 * Auto-detect which IRA target CLIs are present on PATH.
 *
 * Used for --target auto mode: returns the list of targets whose
 * binary can be found via `which`.
 */

import { execFileSync } from "child_process";

type Target = "claude" | "codex";

/**
 * Return every target whose binary exists on PATH.
 * Order: claude first, codex second (deterministic).
 */
export function detectTargets(): Array<Target> {
  const present: Target[] = [];

  for (const target of ["claude", "codex"] as Target[]) {
    if (binaryExists(target)) {
      present.push(target);
    }
  }

  return present;
}

function binaryExists(name: string): boolean {
  try {
    execFileSync("which", [name], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}
