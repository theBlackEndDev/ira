/**
 * TomlPatcher — safe round-trip editing of TOML config files.
 *
 * Uses @iarna/toml for parsing and serialization. Note: @iarna/toml does NOT
 * preserve comments through a write cycle (it round-trips structure, not
 * whitespace/comments). A warning is logged when comments would be stripped.
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import * as TOML from "@iarna/toml";

export class TomlPatcher {
  private filePath: string;
  private parsed: Record<string, any> = {};
  private rawSource: string = "";
  private hasComments: boolean = false;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  /** Read and parse the TOML file. Creates an empty doc if the file does not exist. */
  read(): this {
    if (!existsSync(this.filePath)) {
      this.parsed = {};
      this.rawSource = "";
      this.hasComments = false;
      return this;
    }

    this.rawSource = readFileSync(this.filePath, "utf-8");
    this.hasComments = /^\s*#/m.test(this.rawSource);

    try {
      this.parsed = TOML.parse(this.rawSource) as Record<string, any>;
    } catch (err: any) {
      throw new Error(`TomlPatcher: failed to parse ${this.filePath}: ${err.message}`);
    }

    return this;
  }

  /**
   * Deep-merge a patch object into the parsed document.
   *
   * Only inserts or updates keys — never removes existing keys.
   * Nested tables (objects) are merged recursively. Scalar values are
   * overwritten only when the incoming value differs from the current one.
   */
  merge(patch: Record<string, unknown>): this {
    this.parsed = deepMerge(this.parsed, patch);
    return this;
  }

  /**
   * Serialize and write the patched document back to disk.
   *
   * @param opts.dryRun  When true, only logs what would change — no write.
   * @param opts.log     Optional logger (defaults to console.warn for the comment warning).
   */
  write(opts: { dryRun: boolean; log?: (msg: string) => void }): void {
    const log = opts.log ?? ((msg: string) => console.warn(msg));

    if (this.hasComments) {
      log(
        `WARN         ${this.filePath}: contains comments that will be stripped on re-write (limitation of @iarna/toml)`
      );
    }

    const serialized = TOML.stringify(this.parsed as Parameters<typeof TOML.stringify>[0]);

    if (opts.dryRun) {
      log(`TOML-DRY     Would write ${this.filePath}`);
      return;
    }

    writeFileSync(this.filePath, serialized, "utf-8");
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...target };

  for (const [key, srcVal] of Object.entries(source)) {
    const tgtVal = result[key];

    if (isPlainObject(srcVal) && isPlainObject(tgtVal)) {
      result[key] = deepMerge(tgtVal, srcVal);
    } else {
      result[key] = srcVal;
    }
  }

  return result;
}
