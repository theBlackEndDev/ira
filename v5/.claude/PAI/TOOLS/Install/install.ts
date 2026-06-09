#!/usr/bin/env bun
/**
 * install.ts — one-command IRA installer for macOS AND Linux (Phase 5).
 *
 * Detects the OS, lays the v5 `.claude` tree into a target home, fills the principal timezone
 * (fixing the Phase-0 placeholder crash), optionally starts the Pulse daemon via the platform
 * adapter (launchd on mac / systemd-user on Linux) and runs the seeder. Idempotent.
 *
 * Usage:
 *   bun install.ts [--home <dir>] [--dry-run] [--start-daemons] [--seed] [--timezone <IANA>]
 *
 * SAFETY: defaults to $HOME but accepts --home so it can be exercised against a sandbox without
 * touching the real ~/.claude. --dry-run reports actions without writing.
 */
import { cpSync, existsSync, readFileSync, writeFileSync, readdirSync, chmodSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { getPlatformAdapter, detectOS } from '../../../hooks/lib/platform';

function arg(name: string, def = ''): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : def;
}
function flag(name: string): boolean { return process.argv.includes(`--${name}`); }

const SRC_CLAUDE = resolve(import.meta.dir, '../../..');           // the v5/.claude dir
const HOME = arg('home', homedir());
const DEST = join(HOME, '.claude');
const DRY = flag('dry-run');
const TZ = arg('timezone', Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
const log = (a: string, d: string) => console.log(`  ${DRY ? '[dry] ' : ''}${a.padEnd(10)} ${d}`);

function installTree() {
  log('OS', `${detectOS()} (target home: ${HOME})`);
  if (!existsSync(SRC_CLAUDE) || !existsSync(join(SRC_CLAUDE, 'settings.json'))) {
    console.error(`source .claude not found at ${SRC_CLAUDE}`); process.exit(1);
  }
  if (DRY) { log('COPY', `${SRC_CLAUDE} → ${DEST} (recursive)`); return; }
  mkdirSync(HOME, { recursive: true });
  cpSync(SRC_CLAUDE, DEST, { recursive: true });
  log('COPY', `installed tree → ${DEST}`);
}

function makeHooksExecutable() {
  const hooksDir = join(DEST, 'hooks');
  if (DRY || !existsSync(hooksDir)) { log('CHMOD', 'hooks/*.hook.ts +x'); return; }
  let n = 0;
  for (const f of readdirSync(hooksDir)) {
    if (f.endsWith('.hook.ts') || f.endsWith('.hook.sh')) { try { chmodSync(join(hooksDir, f), 0o755); n++; } catch {} }
  }
  log('CHMOD', `${n} hooks +x`);
}

function fillTimezone() {
  const settingsPath = join(DEST, 'settings.json');
  if (DRY) { log('TZ', `principal.timezone → ${TZ} in settings.json`); return; }
  let s: Record<string, any> = {};
  try { s = JSON.parse(readFileSync(settingsPath, 'utf8')); } catch {}
  s.principal = s.principal || {};
  const cur = s.principal.timezone;
  if (!cur || String(cur).includes('{')) {
    s.principal.timezone = TZ;
    writeFileSync(settingsPath, JSON.stringify(s, null, 2) + '\n');
    log('TZ', `set principal.timezone = ${TZ}`);
  } else {
    log('TZ', `already set (${cur}) — left as-is`);
  }
}

function startDaemons() {
  if (!flag('start-daemons')) { log('DAEMON', 'skipped (pass --start-daemons to enable Pulse)'); return; }
  const adapter = getPlatformAdapter();
  const spec = {
    name: 'ira-pulse',
    description: 'IRA Pulse daemon',
    command: process.execPath, // bun
    args: ['run', join(DEST, 'PAI', 'PULSE', 'pulse.ts')],
    env: { IRA_DIR: DEST },
    workingDir: DEST,
  };
  if (DRY) { const u = adapter.renderServiceUnit(spec); log('DAEMON', `would install ${u.kind} @ ${u.path}`); return; }
  const u = adapter.installService(spec);
  log('DAEMON', `installed + started ${u.kind} @ ${u.path}`);
  if (u.note) log('NOTE', u.note);
}

function runSeed() {
  if (!flag('seed')) { log('SEED', 'skipped (pass --seed to import historical transcripts)'); return; }
  const seedDir = join(SRC_CLAUDE, 'PAI', 'TOOLS', 'Seed');
  // Seed FROM the operator's real transcripts (their actual home), not the install target home.
  const corpus = arg('corpus', join(homedir(), '.claude', 'projects'));
  const redacted = join(DEST, 'PAI', 'MEMORY', '.seed-redacted');
  const work = join(DEST, 'PAI', 'MEMORY', 'WORK');
  const project = arg('project', '');
  const limit = arg('limit', '');
  if (DRY) { log('SEED', `would: RedactCorpus(${corpus}) → SeedFromTranscripts → ${work}`); return; }
  // GATE: redaction must reach gitleaks-0 before any seeding runs.
  log('SEED', 'redacting corpus (gate: gitleaks-0)…');
  const r = spawnSync(process.execPath, [join(seedDir, 'RedactCorpus.ts'), '--src', corpus, '--out', redacted], { stdio: 'inherit' });
  if (r.status !== 0) { console.error('  SEED ABORTED — redaction gate failed.'); return; }
  const seedArgs = [join(seedDir, 'SeedFromTranscripts.ts'), '--src', corpus, '--redacted', redacted, '--out', work];
  if (project) seedArgs.push('--project', project);
  if (limit) seedArgs.push('--limit', limit);
  log('SEED', 'seeding transcripts → WORK ISAs…');
  spawnSync(process.execPath, seedArgs, { stdio: 'inherit' });
}

console.log(`\n=== IRA installer (${DRY ? 'DRY RUN' : 'LIVE'}) ===`);
installTree();
makeHooksExecutable();
fillTimezone();
startDaemons();
runSeed();
console.log(`\nRollback: remove ${DEST} (or restore your backup), and \`docker compose up\` the existing ira-memory stack.`);
console.log('Done.\n');
