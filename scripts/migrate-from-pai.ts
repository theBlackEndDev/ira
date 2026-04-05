#!/usr/bin/env bun
/**
 * PAI → IRA Migration Script
 *
 * Migrates data from an existing PAI installation to IRA.
 * Supports local migration, remote harvesting via rsync, and multi-machine merge.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, statSync, copyFileSync } from "fs";
import { join, dirname, resolve, relative } from "path";
import { execSync } from "child_process";

// ─── Types ───────────────────────────────────────────────────────────────────

interface MigrationOptions {
  sources: string[];
  target: string;
  harvestOnly: boolean;
  mergeLearnings: boolean;
  dryRun: boolean;
  verbose: boolean;
}

interface MigrationStats {
  reflections: number;
  failures: number;
  ratings: number;
  prds: number;
  telos: number;
  userConfig: number;
  events: number;
  projectMemory: number;
  synthesis: number;
}

interface JsonlEntry {
  timestamp?: string;
  ts?: string;
  [key: string]: unknown;
}

// ─── CLI Parsing ─────────────────────────────────────────────────────────────

function printHelp(): void {
  console.log(`
IRA Migration — PAI → IRA

Usage: migrate-from-pai [options]

Options:
  --source <path>       PAI source (local path or user@host:path). Can specify multiple.
  --target <path>       IRA target directory (default: .ira/)
  --harvest-only        Only harvest data, don't install into IRA
  --merge-learnings     Merge learnings from multiple sources
  --dry-run             Show what would be migrated without doing it
  --verbose             Show detailed progress
  --help                Show help

Examples:
  bun run scripts/migrate-from-pai.ts --source ~/.claude
  bun run scripts/migrate-from-pai.ts --source user@server:~/.claude --harvest-only
  bun run scripts/migrate-from-pai.ts --source user@s1:~/.claude --source user@s2:~/.claude --merge-learnings
`);
}

function parseCliArgs(): MigrationOptions {
  const sources: string[] = [];
  const args = process.argv.slice(2);

  let target = ".ira/";
  let harvestOnly = false;
  let mergeLearnings = false;
  let dryRun = false;
  let verbose = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--source":
        if (i + 1 >= args.length) {
          console.error("Error: --source requires a value");
          process.exit(1);
        }
        sources.push(args[++i]);
        break;
      case "--target":
        if (i + 1 >= args.length) {
          console.error("Error: --target requires a value");
          process.exit(1);
        }
        target = args[++i];
        break;
      case "--harvest-only":
        harvestOnly = true;
        break;
      case "--merge-learnings":
        mergeLearnings = true;
        break;
      case "--dry-run":
        dryRun = true;
        break;
      case "--verbose":
        verbose = true;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
      default:
        console.error(`Unknown option: ${args[i]}`);
        printHelp();
        process.exit(1);
    }
  }

  if (sources.length === 0) {
    console.error("Error: at least one --source is required");
    printHelp();
    process.exit(1);
  }

  if (sources.length > 1 && !mergeLearnings) {
    console.error("Error: multiple --source flags require --merge-learnings");
    process.exit(1);
  }

  return { sources, target, harvestOnly, mergeLearnings, dryRun, verbose };
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function log(opts: MigrationOptions, msg: string): void {
  if (opts.verbose) {
    console.log(`  [verbose] ${msg}`);
  }
}

function isRemote(source: string): boolean {
  return /^[^/].*:/.test(source);
}

function extractHostname(source: string): string {
  const match = source.match(/^(?:.*@)?([^:]+):/);
  return match ? match[1] : "local";
}

function ensureDir(dir: string, dryRun: boolean): void {
  if (dryRun) return;
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function expandHome(p: string): string {
  if (p.startsWith("~/")) {
    return join(process.env.HOME || "/home/" + process.env.USER, p.slice(2));
  }
  return p;
}

/** Recursively list all files under a directory */
function walkDir(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

/** Get file mtime as epoch ms */
function getMtime(filePath: string): number {
  try {
    return statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}

/** Read a JSONL file and parse each line */
function readJsonl(filePath: string): JsonlEntry[] {
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, "utf-8").trim();
  if (!content) return [];
  return content
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean) as JsonlEntry[];
}

/** Write entries as JSONL */
function writeJsonl(filePath: string, entries: JsonlEntry[]): void {
  const content = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
  writeFileSync(filePath, content);
}

/** Get timestamp from a JSONL entry for sorting/dedup */
function getTimestamp(entry: JsonlEntry): string {
  return (entry.timestamp || entry.ts || "") as string;
}

/** Deduplicate JSONL entries by timestamp, keeping last occurrence */
function deduplicateJsonl(entries: JsonlEntry[]): JsonlEntry[] {
  const seen = new Map<string, JsonlEntry>();
  for (const entry of entries) {
    const ts = getTimestamp(entry);
    if (ts) {
      seen.set(ts, entry);
    } else {
      // No timestamp — keep all (use index-based key)
      seen.set(`__notimestamp_${seen.size}`, entry);
    }
  }
  return Array.from(seen.values()).sort((a, b) => {
    const tsA = getTimestamp(a);
    const tsB = getTimestamp(b);
    return tsA.localeCompare(tsB);
  });
}

/** Replace PAI references in frontmatter content */
function convertPaiReferences(content: string): string {
  return content
    .replace(/\bPAI\b/g, "IRA")
    .replace(/\bpai\b/g, "ira")
    .replace(/\bPersonal AI Infrastructure\b/gi, "IRA");
}

/** Copy a file, creating parent dirs as needed */
function copyFileSafe(src: string, dest: string, dryRun: boolean): void {
  if (dryRun) return;
  ensureDir(dirname(dest), false);
  copyFileSync(src, dest);
}

/** Write content to a file, creating parent dirs as needed */
function writeFileSafe(dest: string, content: string, dryRun: boolean): void {
  if (dryRun) return;
  ensureDir(dirname(dest), false);
  writeFileSync(dest, content);
}

// ─── Harvesting ──────────────────────────────────────────────────────────────

function harvestRemote(source: string, opts: MigrationOptions): string {
  const hostname = extractHostname(source);
  const tmpDir = `/tmp/ira-harvest-${hostname}`;

  ensureDir(tmpDir, opts.dryRun);

  console.log(`  Harvesting from remote: ${source}`);
  log(opts, `  rsync target: ${tmpDir}`);

  if (!opts.dryRun) {
    try {
      // Harvest MEMORY/
      execSync(
        `rsync -avz --timeout=30 "${source}/MEMORY/" "${tmpDir}/MEMORY/"`,
        { stdio: opts.verbose ? "inherit" : "pipe" }
      );
    } catch (e) {
      log(opts, `  Warning: MEMORY/ harvest failed or partially completed`);
    }

    try {
      // Harvest PAI/USER/
      execSync(
        `rsync -avz --timeout=30 "${source}/PAI/USER/" "${tmpDir}/PAI/USER/"`,
        { stdio: opts.verbose ? "inherit" : "pipe" }
      );
    } catch (e) {
      log(opts, `  Warning: PAI/USER/ harvest failed or partially completed`);
    }

    try {
      // Harvest project-level memory
      execSync(
        `rsync -avz --timeout=30 "${source}/projects/" "${tmpDir}/projects/"`,
        { stdio: opts.verbose ? "inherit" : "pipe" }
      );
    } catch (e) {
      log(opts, `  Warning: projects/ harvest failed or partially completed`);
    }
  }

  return tmpDir;
}

function resolveSource(source: string, opts: MigrationOptions): string {
  if (isRemote(source)) {
    return harvestRemote(source, opts);
  }
  return resolve(expandHome(source));
}

// ─── Migration Steps ─────────────────────────────────────────────────────────

function migrateReflections(
  sourceDir: string,
  targetDir: string,
  opts: MigrationOptions,
  machineId: string
): number {
  const srcFile = join(sourceDir, "MEMORY", "LEARNING", "REFLECTIONS", "algorithm-reflections.jsonl");
  const destDir = join(targetDir, "learning", "reflections");
  const destFile = join(destDir, "algorithm-reflections.jsonl");

  if (!existsSync(srcFile)) {
    log(opts, `  No reflections found at ${srcFile}`);
    return 0;
  }

  const entries = readJsonl(srcFile);
  log(opts, `  Found ${entries.length} reflections`);

  if (opts.dryRun) return entries.length;

  ensureDir(destDir, false);

  if (existsSync(destFile) && opts.mergeLearnings) {
    const existing = readJsonl(destFile);
    const merged = deduplicateJsonl([...existing, ...entries]);
    writeJsonl(destFile, merged);
    return merged.length - existing.length;
  }

  writeJsonl(destFile, entries);
  return entries.length;
}

function migrateFailures(
  sourceDir: string,
  targetDir: string,
  opts: MigrationOptions,
  machineId: string
): number {
  const srcDir = join(sourceDir, "MEMORY", "LEARNING", "FAILURES");
  const destDir = join(targetDir, "learning", "failures");

  if (!existsSync(srcDir)) {
    log(opts, `  No failures directory at ${srcDir}`);
    return 0;
  }

  const files = walkDir(srcDir);
  log(opts, `  Found ${files.length} failure dumps`);

  if (opts.dryRun) return files.length;

  ensureDir(destDir, false);

  for (const file of files) {
    const rel = relative(srcDir, file);
    let destName = rel;
    const destPath = join(destDir, destName);

    if (existsSync(destPath) && machineId !== "local") {
      destName = `${machineId}-${rel}`;
    }

    copyFileSafe(file, join(destDir, destName), false);
  }

  return files.length;
}

function migrateSignals(
  sourceDir: string,
  targetDir: string,
  opts: MigrationOptions,
  machineId: string
): number {
  const srcDir = join(sourceDir, "MEMORY", "LEARNING", "SIGNALS");
  const destDir = join(targetDir, "learning");

  if (!existsSync(srcDir)) {
    log(opts, `  No signals directory at ${srcDir}`);
    return 0;
  }

  const files = walkDir(srcDir);
  let count = 0;

  for (const file of files) {
    const rel = relative(srcDir, file);

    if (file.endsWith(".jsonl")) {
      const entries = readJsonl(file);
      count += entries.length;

      if (opts.dryRun) continue;

      const destFile = join(destDir, rel);
      ensureDir(dirname(destFile), false);

      if (existsSync(destFile) && opts.mergeLearnings) {
        const existing = readJsonl(destFile);
        const merged = deduplicateJsonl([...existing, ...entries]);
        writeJsonl(destFile, merged);
      } else {
        writeJsonl(destFile, entries);
      }
    } else {
      count++;
      if (!opts.dryRun) {
        let destName = rel;
        const destPath = join(destDir, destName);
        if (existsSync(destPath) && machineId !== "local") {
          destName = `${machineId}-${rel}`;
        }
        copyFileSafe(file, join(destDir, destName), false);
      }
    }
  }

  return count;
}

function migrateSynthesis(
  sourceDir: string,
  targetDir: string,
  opts: MigrationOptions,
  machineId: string
): number {
  const srcDir = join(sourceDir, "MEMORY", "LEARNING", "SYNTHESIS");
  const destDir = join(targetDir, "learning", "synthesis");

  if (!existsSync(srcDir)) {
    log(opts, `  No synthesis directory at ${srcDir}`);
    return 0;
  }

  const files = walkDir(srcDir);
  log(opts, `  Found ${files.length} synthesis files`);

  if (opts.dryRun) return files.length;

  ensureDir(destDir, false);

  for (const file of files) {
    const rel = relative(srcDir, file);
    let destName = rel;
    const destPath = join(destDir, destName);

    if (existsSync(destPath) && machineId !== "local") {
      destName = `${machineId}-${rel}`;
    }

    copyFileSafe(file, join(destDir, destName), false);
  }

  return files.length;
}

function migratePrds(
  sourceDir: string,
  targetDir: string,
  opts: MigrationOptions,
  machineId: string
): number {
  const srcDir = join(sourceDir, "MEMORY", "WORK");
  const destDir = join(targetDir, "work");

  if (!existsSync(srcDir)) {
    log(opts, `  No work directory at ${srcDir}`);
    return 0;
  }

  const files = walkDir(srcDir).filter((f) => f.endsWith("PRD.md") || f.endsWith("prd.md"));
  log(opts, `  Found ${files.length} PRD files`);

  if (opts.dryRun) return files.length;

  ensureDir(destDir, false);

  for (const file of files) {
    const rel = relative(srcDir, file);
    const content = readFileSync(file, "utf-8");

    // Convert frontmatter PAI references
    const converted = convertPaiReferences(content);

    const destPath = join(destDir, rel);
    writeFileSafe(destPath, converted, false);
  }

  return files.length;
}

function migrateTelos(
  sourceDir: string,
  targetDir: string,
  opts: MigrationOptions,
  machineId: string
): number {
  const srcDir = join(sourceDir, "PAI", "USER", "TELOS");
  const destDir = join(targetDir, "telos");

  if (!existsSync(srcDir)) {
    log(opts, `  No TELOS directory at ${srcDir}`);
    return 0;
  }

  const files = walkDir(srcDir);
  log(opts, `  Found ${files.length} TELOS files`);

  if (opts.dryRun) return files.length;

  ensureDir(destDir, false);

  for (const file of files) {
    const rel = relative(srcDir, file);
    const destPath = join(destDir, rel);

    // Multi-machine merge: keep newest version by mtime
    if (existsSync(destPath) && opts.mergeLearnings) {
      if (getMtime(file) <= getMtime(destPath)) {
        log(opts, `  Skipping older TELOS file: ${rel}`);
        continue;
      }
    }

    copyFileSafe(file, destPath, false);
  }

  return files.length;
}

function migrateUserConfig(
  sourceDir: string,
  targetDir: string,
  opts: MigrationOptions
): number {
  const userSrcDir = join(sourceDir, "PAI", "USER");
  const userDestDir = join(targetDir, "user");
  let count = 0;

  const fileMap: Record<string, string> = {
    "AISTEERINGRULES.md": "steering-rules.md",
    "ABOUTME.md": "about.md",
    "OPINIONS.md": "opinions.md",
    "WRITINGSTYLE.md": "writing-style.md",
  };

  for (const [src, dest] of Object.entries(fileMap)) {
    const srcPath = join(userSrcDir, src);
    if (existsSync(srcPath)) {
      log(opts, `  Migrating ${src} → ${dest}`);
      if (!opts.dryRun) {
        copyFileSafe(srcPath, join(userDestDir, dest), false);
      }
      count++;
    }
  }

  // Skill customizations
  const skillSrcDir = join(userSrcDir, "SKILLCUSTOMIZATIONS");
  if (existsSync(skillSrcDir)) {
    const skillFiles = walkDir(skillSrcDir);
    for (const file of skillFiles) {
      const rel = relative(skillSrcDir, file);
      log(opts, `  Migrating skill customization: ${rel}`);
      if (!opts.dryRun) {
        copyFileSafe(
          file,
          join(userDestDir, "skill-overrides", rel),
          false
        );
      }
      count++;
    }
  }

  return count;
}

function migrateEvents(
  sourceDir: string,
  targetDir: string,
  opts: MigrationOptions,
  machineId: string
): number {
  const srcFile = join(sourceDir, "MEMORY", "STATE", "events.jsonl");
  const destFile = join(targetDir, "events.jsonl");

  if (!existsSync(srcFile)) {
    log(opts, `  No events file at ${srcFile}`);
    return 0;
  }

  const entries = readJsonl(srcFile);
  log(opts, `  Found ${entries.length} events`);

  if (opts.dryRun) return entries.length;

  ensureDir(dirname(destFile), false);

  if (existsSync(destFile)) {
    const existing = readJsonl(destFile);
    const merged = deduplicateJsonl([...existing, ...entries]);
    writeJsonl(destFile, merged);
    return merged.length - existing.length;
  }

  writeJsonl(destFile, entries);
  return entries.length;
}

function migrateWorkState(
  sourceDir: string,
  targetDir: string,
  opts: MigrationOptions
): void {
  const srcFile = join(sourceDir, "MEMORY", "STATE", "work.json");
  const destFile = join(targetDir, "state", "work.json");

  if (!existsSync(srcFile)) {
    log(opts, `  No work.json at ${srcFile}`);
    return;
  }

  log(opts, `  Migrating work.json`);
  if (!opts.dryRun) {
    ensureDir(dirname(destFile), false);
    copyFileSync(srcFile, destFile);
  }
}

function migrateProjectMemory(
  sourceDir: string,
  targetDir: string,
  opts: MigrationOptions,
  machineId: string
): number {
  const projectsDir = join(sourceDir, "projects");
  if (!existsSync(projectsDir)) {
    log(opts, `  No projects directory at ${projectsDir}`);
    return 0;
  }

  const destDir = join(targetDir, "memory", "projects");
  let count = 0;

  let projectDirs: string[];
  try {
    projectDirs = readdirSync(projectsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return 0;
  }

  for (const project of projectDirs) {
    const memoryDir = join(projectsDir, project, "memory");
    if (!existsSync(memoryDir)) continue;

    const files = walkDir(memoryDir).filter((f) => f.endsWith(".md"));

    for (const file of files) {
      const rel = relative(memoryDir, file);
      const projectSlug = project.replace(/[^a-zA-Z0-9_-]/g, "_");
      let destName = join(projectSlug, rel);
      const destPath = join(destDir, destName);

      // Handle name collisions in multi-machine merge
      if (existsSync(destPath) && machineId !== "local") {
        const ext = ".md";
        const base = destName.slice(0, -ext.length);
        destName = `${base}-${machineId}${ext}`;
      }

      log(opts, `  Project memory: ${project}/${rel}`);
      if (!opts.dryRun) {
        copyFileSafe(file, join(destDir, destName), false);
      }
      count++;
    }
  }

  return count;
}

// ─── Main ────────────────────────────────────────────────────────────────────

function formatNumber(n: number): string {
  return n.toLocaleString();
}

async function main(): Promise<void> {
  const opts = parseCliArgs();
  const targetDir = resolve(expandHome(opts.target));

  console.log("");
  console.log("IRA Migration — PAI → IRA");
  console.log("");

  for (const s of opts.sources) {
    console.log(`Source: ${s}`);
  }
  console.log(`Target: ${opts.target}`);
  if (opts.dryRun) console.log("Mode:   DRY RUN");
  if (opts.harvestOnly) console.log("Mode:   HARVEST ONLY");
  if (opts.mergeLearnings) console.log("Mode:   MERGE LEARNINGS");
  console.log("");

  // Resolve all sources (download remote ones)
  console.log("Harvesting...");
  const resolvedSources: { path: string; machineId: string }[] = [];

  for (const source of opts.sources) {
    const machineId = isRemote(source) ? extractHostname(source) : "local";
    const resolved = resolveSource(source, opts);
    resolvedSources.push({ path: resolved, machineId });
    log(opts, `Resolved ${source} → ${resolved} (${machineId})`);
  }

  // If harvest-only with remote sources, stop here
  if (opts.harvestOnly) {
    console.log("");
    console.log("Harvest complete. Data stored in /tmp/ira-harvest-*/");
    console.log("Source PAI installation was NOT modified.");
    return;
  }

  // Ensure target directory exists
  ensureDir(targetDir, opts.dryRun);

  // Aggregate stats across all sources
  const totals: MigrationStats = {
    reflections: 0,
    failures: 0,
    ratings: 0,
    prds: 0,
    telos: 0,
    userConfig: 0,
    events: 0,
    projectMemory: 0,
    synthesis: 0,
  };

  for (const { path: sourceDir, machineId } of resolvedSources) {
    if (resolvedSources.length > 1) {
      console.log(`\n  Processing source: ${machineId} (${sourceDir})`);
    }

    // Reflections
    const reflections = migrateReflections(sourceDir, targetDir, opts, machineId);
    if (reflections > 0) console.log(`  ✓ Reflections: ${formatNumber(reflections)} entries`);
    totals.reflections += reflections;

    // Failures
    const failures = migrateFailures(sourceDir, targetDir, opts, machineId);
    if (failures > 0) console.log(`  ✓ Failures: ${formatNumber(failures)} dumps`);
    totals.failures += failures;

    // Signals (ratings)
    const ratings = migrateSignals(sourceDir, targetDir, opts, machineId);
    if (ratings > 0) console.log(`  ✓ Ratings: ${formatNumber(ratings)} signals`);
    totals.ratings += ratings;

    // Synthesis
    const synthesis = migrateSynthesis(sourceDir, targetDir, opts, machineId);
    if (synthesis > 0) console.log(`  ✓ Synthesis: ${formatNumber(synthesis)} files`);
    totals.synthesis += synthesis;

    // PRDs
    const prds = migratePrds(sourceDir, targetDir, opts, machineId);
    if (prds > 0) console.log(`  ✓ PRDs: ${formatNumber(prds)} work items`);
    totals.prds += prds;

    // TELOS
    const telos = migrateTelos(sourceDir, targetDir, opts, machineId);
    if (telos > 0) console.log(`  ✓ TELOS: ${formatNumber(telos)} files`);
    totals.telos += telos;

    // User config
    const userConfig = migrateUserConfig(sourceDir, targetDir, opts);
    if (userConfig > 0) console.log(`  ✓ User config: ${formatNumber(userConfig)} files`);
    totals.userConfig += userConfig;

    // Events
    const events = migrateEvents(sourceDir, targetDir, opts, machineId);
    if (events > 0) console.log(`  ✓ Events: ${formatNumber(events)} entries`);
    totals.events += events;

    // Work state
    migrateWorkState(sourceDir, targetDir, opts);

    // Project memory
    const projectMemory = migrateProjectMemory(sourceDir, targetDir, opts, machineId);
    if (projectMemory > 0) console.log(`  ✓ Project memory: ${formatNumber(projectMemory)} files`);
    totals.projectMemory += projectMemory;
  }

  // Summary
  console.log("");
  console.log("Migration complete.");
  console.log(
    `  Total learnings harvested: ${formatNumber(totals.reflections)} reflections, ${formatNumber(totals.failures)} failure dumps, ${formatNumber(totals.ratings)} ratings`
  );
  if (totals.synthesis > 0) {
    console.log(`  Synthesis files: ${formatNumber(totals.synthesis)}`);
  }
  console.log(`  Work history: ${formatNumber(totals.prds)} PRD files preserved`);
  console.log(
    `  User context: ${totals.telos > 0 ? "TELOS + " : ""}${totals.userConfig > 0 ? "config " : ""}migrated`
  );
  if (totals.events > 0) {
    console.log(`  Events: ${formatNumber(totals.events)} entries`);
  }
  if (totals.projectMemory > 0) {
    console.log(`  Project memory: ${formatNumber(totals.projectMemory)} files`);
  }
  console.log("");
  console.log("Source PAI installation was NOT modified.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
