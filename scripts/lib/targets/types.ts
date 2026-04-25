/**
 * TargetAdapter — interface every install target must implement.
 *
 * A TargetAdapter encapsulates all target-specific install logic so that
 * setup.ts can remain target-agnostic: it builds a list of adapters and calls
 * install() on each one.
 */

export interface InstallOpts {
  dryRun: boolean;
  iraDir: string;
  log: (msg: string) => void;
}

export interface TargetAdapter {
  readonly name: "claude" | "codex";
  /** Return true if the CLI binary for this target is on PATH. */
  detect(): boolean;
  /** Perform the full install for this target. */
  install(opts: InstallOpts): void;
}
