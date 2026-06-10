#!/usr/bin/env bun
/**
 * update.ts — one-command updater for an IRA deployment (macOS + Linux).
 *
 * Pulls the latest `ira` and `ira-memory` repos, updates the backend (deps + DB migrations),
 * reinstalls the IRA tree into ~/.claude, and restarts the daemons — so keeping a machine
 * current is `bun run update` instead of a remembered sequence of git/install/restart steps.
 *
 * SELF-CONTAINED on purpose: no imports from v5/.claude, so it still runs on an OLD checkout
 * the moment it lands via the first `git pull` (before the rest of the new tree is trusted).
 *
 * Usage:
 *   bun run scripts/update.ts [--no-backup] [--seed] [--dry-run] [--force]
 *
 * Flags:
 *   --no-backup  skip the ~/.claude tarball (default: back up first, it's cheap insurance)
 *   --seed       pass --seed to the IRA installer (import THIS machine's transcript history)
 *   --dry-run    print every action without running it
 *   --force      proceed even if a repo has uncommitted tracked changes (default: stop)
 *
 * Repo locations resolve from (in order): env override, the script's own location (ira), and
 * conventional paths. Override with IRA_REPO / IRA_MEMORY_REPO (or IRA_MEMORY_PROJECT) when a
 * machine lays the repos out differently.
 */
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir, userInfo } from 'node:os';
import { join, resolve } from 'node:path';

const HOME = homedir();
const OS: 'darwin' | 'linux' | 'other' =
  process.platform === 'darwin' ? 'darwin' : process.platform === 'linux' ? 'linux' : 'other';

const flag = (n: string) => process.argv.includes(`--${n}`);
const DRY = flag('dry-run');
const NO_BACKUP = flag('no-backup');
const SEED = flag('seed');
const FORCE = flag('force');

function log(tag: string, msg: string) { console.log(`  ${DRY ? '[dry] ' : ''}${tag.padEnd(9)} ${msg}`); }
function die(msg: string): never { console.error(`\n✗ ${msg}`); process.exit(1); }

/** Run a command, streaming output. Returns the result; never throws. */
function run(cmd: string, args: string[], cwd?: string): SpawnSyncReturns<string> {
  if (DRY) { log('RUN', `${cmd} ${args.join(' ')}${cwd ? `  (in ${cwd})` : ''}`); return { status: 0 } as any; }
  return spawnSync(cmd, args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'inherit', 'inherit'] });
}
/** Run a command capturing stdout (for git queries). */
function capture(cmd: string, args: string[], cwd?: string): string {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf-8' });
  return (r.stdout || '').trim();
}

// ── Resolve repo locations ───────────────────────────────────────────────────
// The running script lives at <ira>/scripts/update.ts, so the ira repo is two levels up —
// the most reliable anchor we have, regardless of where the operator cloned it.
const IRA_REPO = process.env.IRA_REPO || resolve(import.meta.dir, '..');

function resolveMemoryRepo(): string | null {
  const candidates = [
    process.env.IRA_MEMORY_REPO,
    process.env.IRA_MEMORY_PROJECT,
    join(HOME, 'golden-claw-workspace', 'orchestrator', 'projects', 'ira-memory'),
  ].filter(Boolean) as string[];
  for (const c of candidates) if (existsSync(join(c, 'package.json'))) return c;
  return null;
}
const IRA_MEMORY_REPO = resolveMemoryRepo();

const INSTALLER = join(IRA_REPO, 'v5', '.claude', 'PAI', 'TOOLS', 'Install', 'install.ts');

// ── Preflight ────────────────────────────────────────────────────────────────
function isGitRepo(dir: string): boolean { return existsSync(join(dir, '.git')); }

/** Tracked, uncommitted changes block a pull (untracked files are fine). */
function dirtyTracked(dir: string): string[] {
  return capture('git', ['status', '--porcelain', '--untracked-files=no'], dir)
    .split('\n').filter(Boolean);
}

console.log(`\n=== IRA update (${OS}${DRY ? ', dry-run' : ''}) ===`);
log('IRA', IRA_REPO);
log('MEMORY', IRA_MEMORY_REPO || '(not found — backend update will be skipped)');

if (!isGitRepo(IRA_REPO)) die(`ira repo at ${IRA_REPO} is not a git checkout`);
if (!existsSync(INSTALLER)) die(`installer not found at ${INSTALLER} — is this an older checkout? Pull ira manually once, then re-run.`);

const repos = [{ name: 'ira', dir: IRA_REPO }, ...(IRA_MEMORY_REPO ? [{ name: 'ira-memory', dir: IRA_MEMORY_REPO }] : [])];
for (const r of repos) {
  const dirty = dirtyTracked(r.dir);
  if (dirty.length && !FORCE) {
    die(`${r.name} has uncommitted tracked changes — commit/stash them or re-run with --force:\n${dirty.map(d => '    ' + d).join('\n')}`);
  }
  if (dirty.length) log('WARN', `${r.name} is dirty; --force given, pulling with --autostash`);
}

// ── 1. Backup ~/.claude (excludes the large projects/ corpus the install never touches) ──
if (!NO_BACKUP) {
  const claudeDir = join(HOME, '.claude');
  if (existsSync(claudeDir)) {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    const ts = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
    const tarball = join(HOME, `ira-claude-backup-${ts}.tgz`);
    // --exclude + -C are supported by both BSD (macOS) and GNU (Linux) tar.
    const res = run('tar', ['czf', tarball, '--exclude=.claude/projects', '-C', HOME, '.claude']);
    if (res.status === 0) log('BACKUP', tarball);
    else log('BACKUP', `⚠️ tar exited ${res.status} — continuing (use --no-backup to skip)`);
  } else log('BACKUP', 'no ~/.claude yet — nothing to back up');
} else log('BACKUP', 'skipped (--no-backup)');

// ── 2. Pull both repos (fast-forward only; --autostash under --force) ──
for (const r of repos) {
  const before = capture('git', ['rev-parse', '--short', 'HEAD'], r.dir);
  const args = ['pull', '--ff-only', ...(FORCE ? ['--autostash'] : [])];
  const res = run('git', args, r.dir);
  if (res.status !== 0) die(`git pull failed in ${r.name} (${r.dir}). Resolve manually (diverged history?) and re-run.`);
  const after = capture('git', ['rev-parse', '--short', 'HEAD'], r.dir);
  log('PULL', `${r.name}: ${before === after ? `${after} (already current)` : `${before} → ${after}`}`);
}

// ── 3. Update the ira-memory backend (deps + DB), then restart it ──
if (IRA_MEMORY_REPO) {
  run('bun', ['install'], IRA_MEMORY_REPO);
  log('DEPS', 'ira-memory: bun install');
  // prisma generate is safe always; migrate deploy applies pending migrations without prompting
  // (the production-safe counterpart to `migrate dev`). No-op when the schema is unchanged.
  run('bunx', ['prisma', 'generate'], IRA_MEMORY_REPO);
  const mig = run('bunx', ['prisma', 'migrate', 'deploy'], IRA_MEMORY_REPO);
  log('DB', mig.status === 0 ? 'prisma generate + migrate deploy' : `⚠️ migrate deploy exited ${mig.status} (check DATABASE_URL / docker compose up)`);
  restartService('ira-memory-api');
}

// ── 4. Reinstall the IRA tree (re-lays ~/.claude, restarts ira-pulse) ──
const installArgs = [INSTALLER, '--home', HOME, '--start-daemons', ...(SEED ? ['--seed'] : [])];
const inst = run('bun', installArgs);
if (inst.status !== 0) die('IRA installer failed — your backup is intact; restore with: tar xzf <backup>.tgz -C ~');
log('INSTALL', `IRA tree → ${join(HOME, '.claude')}${SEED ? ' (+ seeded)' : ''}`);

// ── 5. Health checks (best-effort) ──
healthCheck('memory-api', 'http://127.0.0.1:7775/health');
healthCheck('pulse', 'http://127.0.0.1:31337/health');

console.log(`\n✓ Update complete.${DRY ? ' (dry-run — nothing changed)' : ''}`);

// ── helpers ────────────────────────────────────────────────────────────────
/** Restart a user service cross-platform. Best-effort: unmanaged setups get a printed hint. */
function restartService(name: string) {
  if (DRY) { log('RESTART', name); return; }
  if (OS === 'linux') {
    const r = spawnSync('systemctl', ['--user', 'restart', `${name}.service`], { encoding: 'utf-8' });
    if (r.status === 0) { log('RESTART', `${name} (systemd)`); return; }
  } else if (OS === 'darwin') {
    const uid = userInfo().uid;
    const r = spawnSync('launchctl', ['kickstart', '-k', `gui/${uid}/com.ira.${name}`], { encoding: 'utf-8' });
    if (r.status === 0) { log('RESTART', `${name} (launchd)`); return; }
  }
  log('RESTART', `⚠️ ${name}: no managed unit found — restart it manually so it picks up the new code`);
}

function healthCheck(label: string, url: string) {
  if (DRY) { log('HEALTH', `${label} ${url}`); return; }
  const r = spawnSync('curl', ['-s', '--max-time', '4', url], { encoding: 'utf-8' });
  const ok = r.status === 0 && /"?status"?\s*:?\s*"?ok|<!DOCTYPE|<html/i.test(r.stdout || '');
  log('HEALTH', `${label}: ${ok ? '✓ up' : '⚠️ no response (may still be starting — re-check in a few seconds)'}`);
}
