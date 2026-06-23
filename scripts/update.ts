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
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
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
// --gira-only: pull the ira repo + reinstall GIRA (Gemini/Antigravity) and nothing else.
// For work boxes that run GIRA but NOT the Claude IRA stack — skips the ~/.claude install,
// Pulse, and the ira-memory backend steps (manage ira-memory separately there).
const GIRA_ONLY = flag('gira-only');

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

if (!GIRA_ONLY) {
  console.log(`\n=== IRA update (${OS}${DRY ? ', dry-run' : ''}) ===`);
  log('IRA', IRA_REPO);
  log('MEMORY', IRA_MEMORY_REPO || '(not found — backend update will be skipped)');
}

if (!isGitRepo(IRA_REPO)) die(`ira repo at ${IRA_REPO} is not a git checkout`);
if (!existsSync(INSTALLER)) die(`installer not found at ${INSTALLER} — is this an older checkout? Pull ira manually once, then re-run.`);

// --gira-only updates only the ira repo (GIRA is generated from it); ira-memory is managed
// separately on GIRA-only boxes.
const repos = GIRA_ONLY
  ? [{ name: 'ira', dir: IRA_REPO }]
  : [{ name: 'ira', dir: IRA_REPO }, ...(IRA_MEMORY_REPO ? [{ name: 'ira-memory', dir: IRA_MEMORY_REPO }] : [])];
for (const r of repos) {
  const dirty = dirtyTracked(r.dir);
  if (dirty.length && !FORCE) {
    die(`${r.name} has uncommitted tracked changes — commit/stash them or re-run with --force:\n${dirty.map(d => '    ' + d).join('\n')}`);
  }
  if (dirty.length) log('WARN', `${r.name} is dirty; --force given, pulling with --autostash`);
}

// ── GIRA-ONLY fast path: pull ira, (re)install GIRA to detected harnesses, then stop. ──
// Skips the ~/.claude install, Pulse, and the ira-memory backend steps entirely.
if (GIRA_ONLY) {
  console.log(`\n=== IRA update — GIRA only (${OS}${DRY ? ', dry-run' : ''}) ===`);
  log('IRA', IRA_REPO);
  const before = capture('git', ['rev-parse', '--short', 'HEAD'], IRA_REPO);
  const res = run('git', ['pull', '--ff-only', ...(FORCE ? ['--autostash'] : [])], IRA_REPO);
  if (res.status !== 0) die(`git pull failed in ira (${IRA_REPO}). Resolve manually and re-run.`);
  const after = capture('git', ['rev-parse', '--short', 'HEAD'], IRA_REPO);
  log('PULL', `ira: ${before === after ? `${after} (already current)` : `${before} → ${after}`}`);

  const giraInstaller = join(IRA_REPO, 'targets', 'gemini', 'install.ts');
  if (!existsSync(giraInstaller)) die(`GIRA installer not found at ${giraInstaller}`);
  const gi = run('bun', [giraInstaller, '--target', 'auto']);
  if (gi.status !== 0) die('GIRA install failed.');
  console.log(`\n✓ GIRA updated.${DRY ? ' (dry-run — nothing changed)' : ''}\n`);
  process.exit(0);
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

// ── 3. Update the ira-memory backend: deps → DB up → migrate → managed service ──
if (IRA_MEMORY_REPO) {
  run('bun', ['install'], IRA_MEMORY_REPO);
  log('DEPS', 'ira-memory: bun install');
  ensureDb(IRA_MEMORY_REPO);
  run('bunx', ['prisma', 'generate'], IRA_MEMORY_REPO);
  // migrate deploy is the production-safe, non-interactive counterpart to `migrate dev`;
  // retry briefly because the DB container may have only just started above.
  const migrated = migrateWithRetry(IRA_MEMORY_REPO);
  log('DB', migrated ? 'prisma migrate deploy' : '⚠️ migrate deploy failed — is the DB up? (docker compose up / check DATABASE_URL)');
  ensureMemoryService(IRA_MEMORY_REPO);
}

// ── 4. Reinstall the IRA tree (re-lays ~/.claude, restarts ira-pulse) ──
const installArgs = [INSTALLER, '--home', HOME, '--start-daemons', ...(SEED ? ['--seed'] : [])];
const inst = run('bun', installArgs);
if (inst.status !== 0) die('IRA installer failed — your backup is intact; restore with: tar xzf <backup>.tgz -C ~');
log('INSTALL', `IRA tree → ${join(HOME, '.claude')}${SEED ? ' (+ seeded)' : ''}`);

// ── 5. Refresh GIRA (Gemini CLI / Antigravity) — only on machines that already have it ──
refreshGira();

// ── 6. Health checks (best-effort) ──
healthCheck('memory-api', 'http://127.0.0.1:7775/health');
healthCheck('pulse', 'http://127.0.0.1:31337/health');

console.log(`\n✓ Update complete.${DRY ? ' (dry-run — nothing changed)' : ''}`);

/**
 * Regenerate + reinstall GIRA (the Gemini CLI extension / Antigravity plugin) — but ONLY for
 * targets already installed on this machine, so update never forces GIRA onto a Claude-only box.
 * The installer regenerates from the freshly-pulled v5 tree, so GIRA tracks IRA on every update.
 */
function refreshGira() {
  const installer = join(IRA_REPO, 'targets', 'gemini', 'install.ts');
  if (!existsSync(installer)) return;
  const have: string[] = [];
  if (existsSync(join(HOME, '.gemini', 'extensions', 'gira'))) have.push('gemini');
  if (existsSync(join(HOME, '.gemini', 'antigravity-cli', 'plugins', 'gira'))) have.push('antigravity');
  if (have.length === 0) { log('GIRA', 'not installed — skipping (run targets/gemini/install.ts to add)'); return; }
  if (DRY) { log('GIRA', `refresh ${have.join(', ')}`); return; }
  const r = spawnSync('bun', [installer, '--target', have.join(',') === 'gemini,antigravity' ? 'both' : have[0]], { encoding: 'utf-8', stdio: ['ignore', 'inherit', 'inherit'] });
  log('GIRA', r.status === 0 ? `refreshed ${have.join(', ')}` : `⚠️ refresh exited ${r.status}`);
}

// ── helpers ────────────────────────────────────────────────────────────────
/** Bring the backend DB container up (idempotent). Needs Docker running; best-effort. */
function ensureDb(repo: string) {
  if (DRY) { log('DB-UP', 'docker compose up -d'); return; }
  if (!existsSync(join(repo, 'docker-compose.yml')) && !existsSync(join(repo, 'compose.yml'))) {
    log('DB-UP', 'no compose file — skipping (external DB?)'); return;
  }
  let r = spawnSync('docker', ['compose', 'up', '-d'], { cwd: repo, encoding: 'utf-8' });
  if (r.error || r.status !== 0) {                     // older Docker without the compose plugin
    const legacy = spawnSync('docker-compose', ['up', '-d'], { cwd: repo, encoding: 'utf-8' });
    if (!legacy.error && legacy.status === 0) r = legacy;
  }
  if (!r.error && r.status === 0) log('DB-UP', 'docker compose up -d');
  else log('DB-UP', `⚠️ couldn't start DB — is Docker running? (${(r.stderr || '').split('\n')[0] || r.error?.message || 'exit ' + r.status})`);
}

/** Run `prisma migrate deploy`, retrying only while the DB is still unreachable (just-started). */
function migrateWithRetry(repo: string): boolean {
  if (DRY) { log('RUN', 'bunx prisma migrate deploy (retry while DB warms)'); return true; }
  for (let attempt = 0; attempt < 6; attempt++) {
    const r = spawnSync('bunx', ['prisma', 'migrate', 'deploy'], { cwd: repo, encoding: 'utf-8' });
    if (r.status === 0) return true;
    const out = (r.stderr || '') + (r.stdout || '');
    if (!/P1001|Can't reach|ECONNREFUSED|ENOTFOUND/.test(out)) return false; // real migration error, not warm-up
    Bun.sleepSync(3000);                                                     // DB still booting; wait + retry
  }
  return false;
}

/**
 * Install (or refresh) a managed ira-memory-api service for :7775 and start it.
 * The installer manages ira-pulse but not this backend, so the updater owns it — making the
 * memory API self-healing and restartable on BOTH machines (the gap that left the Mac with
 * "no managed unit"). Idempotent: rewrites the unit + restarts every run.
 */
function ensureMemoryService(repo: string) {
  const name = 'ira-memory-api';
  const bun = process.execPath;            // the bun binary running this script — correct on any machine
  if (DRY) { log('SERVICE', `install + start ${name} (${OS === 'darwin' ? 'launchd' : OS === 'linux' ? 'systemd' : 'manual'})`); return; }

  if (OS === 'linux') {
    const unitDir = join(HOME, '.config', 'systemd', 'user'); mkdirSync(unitDir, { recursive: true });
    const logDir = join(HOME, '.claude', 'logs'); mkdirSync(logDir, { recursive: true });
    const logFile = join(logDir, 'ira-memory-api.log');
    const unit = `[Unit]
Description=IRA Memory HTTP API (:7775)
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${repo}
ExecStart=${bun} run src/http-server.ts
Restart=on-failure
RestartSec=3
StandardOutput=append:${logFile}
StandardError=append:${logFile}
Environment=NODE_ENV=production

[Install]
WantedBy=default.target
`;
    writeFileSync(join(unitDir, `${name}.service`), unit);
    spawnSync('systemctl', ['--user', 'daemon-reload']);
    spawnSync('systemctl', ['--user', 'enable', '--now', `${name}.service`]);
    spawnSync('systemctl', ['--user', 'restart', `${name}.service`]);
    log('SERVICE', `${name} → systemd (installed + restarted)`);
  } else if (OS === 'darwin') {
    const laDir = join(HOME, 'Library', 'LaunchAgents'); mkdirSync(laDir, { recursive: true });
    const logFile = join(HOME, 'Library', 'Logs', 'com.ira.ira-memory-api.log');
    const label = `com.ira.${name}`;
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${bun}</string>
    <string>run</string>
    <string>src/http-server.ts</string>
  </array>
  <key>WorkingDirectory</key><string>${repo}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${logFile}</string>
  <key>StandardErrorPath</key><string>${logFile}</string>
</dict>
</plist>
`;
    const plistPath = join(laDir, `${label}.plist`);
    writeFileSync(plistPath, plist);
    const uid = userInfo().uid;
    spawnSync('launchctl', ['bootout', `gui/${uid}/${label}`]);          // ignore if not loaded
    spawnSync('launchctl', ['bootstrap', `gui/${uid}`, plistPath]);
    spawnSync('launchctl', ['kickstart', '-k', `gui/${uid}/${label}`]);
    log('SERVICE', `${name} → launchd (installed + restarted)`);
  } else {
    log('SERVICE', `⚠️ ${OS}: start the memory API manually — bun run src/http-server.ts (in ${repo})`);
  }
}

function healthCheck(label: string, url: string) {
  if (DRY) { log('HEALTH', `${label} ${url}`); return; }
  const r = spawnSync('curl', ['-s', '--max-time', '4', url], { encoding: 'utf-8' });
  const ok = r.status === 0 && /"?status"?\s*:?\s*"?ok|<!DOCTYPE|<html/i.test(r.stdout || '');
  log('HEALTH', `${label}: ${ok ? '✓ up' : '⚠️ no response (may still be starting — re-check in a few seconds)'}`);
}
