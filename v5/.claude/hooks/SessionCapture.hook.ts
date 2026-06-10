#!/usr/bin/env bun
/**
 * SessionCapture.hook.ts — SessionEnd: persist the ended session into BOTH memory layers.
 *
 * TRIGGER: SessionEnd (fires on exit AND /clear)
 *
 * The v5 cutover originally shipped read-only memory: LoadContext/IraRecall read, the install-time
 * seeder backfills history, but nothing captured NEW sessions — so work done after install was
 * invisible to the next session (found live 2026-06-09: a code review vanished after /clear).
 * This hook restores the two write paths the pre-v5 config had on SessionEnd:
 *
 *   A. Conversation → ira-memory (:7775 Postgres) via cc-capture.ts — powers /conversation/recent,
 *      conversation search, and the resume-session skill.
 *   B. Transcript → PAI WORK ISA via SeedFromTranscripts.ts — powers LoadContext's full-ISA
 *      injection at next SessionStart (detail-survives-/clear).
 *
 * SAFETY GATE (same contract as install-time seeding): a transcript is only seeded after a
 * gitleaks scan. Dirty files get a masked overlay copy (same layout RedactCorpus.ts produces;
 * the seeder prefers the overlay). If gitleaks is unavailable or masking fails to scan clean,
 * the file is NOT seeded — never seed unscanned content. Conversation capture (A) is independent
 * of the gate: it goes to the local DB, not portable artifacts, matching pre-v5 behavior.
 *
 * Fail-open everywhere: an error in either path must never block session end.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join, dirname, relative, basename } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const HOME = homedir();
const PAI_DIR = process.env.PAI_DIR || join(HOME, '.claude', 'PAI');
const CORPUS = join(HOME, '.claude', 'projects');
const OVERLAY = join(PAI_DIR, 'MEMORY', '.seed-redacted');
const WORK = join(PAI_DIR, 'MEMORY', 'WORK');
const SEEDER = join(PAI_DIR, 'TOOLS', 'Seed', 'SeedFromTranscripts.ts');
const CHECKPOINT = join(WORK, '.seed-checkpoint.json');

function debugLog(...args: unknown[]) {
  if (process.env.IRA_HOOK_DEBUG === '1') console.error('[SessionCapture]', ...args);
}

/** Locate the ira-memory project for cc-capture (env override → conventional path). */
function memoryProject(): string | null {
  const candidates = [
    process.env.IRA_MEMORY_PROJECT,
    join(HOME, 'golden-claw-workspace', 'orchestrator', 'projects', 'ira-memory'),
  ].filter(Boolean) as string[];
  for (const c of candidates) {
    if (existsSync(join(c, 'src', 'cc-capture.ts'))) return c;
  }
  return null;
}

/** gitleaks scan of one path. Returns findings (empty = clean), or null if gitleaks unusable. */
interface Finding { File: string; Secret: string; RuleID: string }
function scan(path: string, plaintext: boolean): Finding[] | null {
  const report = join(tmpdir(), `ira-capture-scan-${process.pid}-${Math.floor(performance.now())}.json`);
  const args = ['dir', path, '--report-path', report, '--report-format', 'json', '--no-banner'];
  if (!plaintext) args.push('--redact');
  const r = spawnSync('gitleaks', args, { encoding: 'utf8', timeout: 20_000 });
  try {
    if (r.error) return null; // gitleaks missing/not runnable
    const findings = JSON.parse(readFileSync(report, 'utf8'));
    return Array.isArray(findings) ? findings : [];
  } catch {
    // gitleaks exits 1 on findings but still writes the report; unreadable report = treat as unusable
    return r.status === 0 ? [] : null;
  } finally {
    try { rmSync(report, { force: true }) } catch {}
  }
}

/**
 * Gate one transcript: scan, mask into overlay if dirty, verify.
 * 'safe' = seedable | 'blocked' = secrets we could not cleanly mask (checkpoint it; a future
 * full install --seed re-redacts) | 'unavailable' = gitleaks not runnable (do NOT checkpoint —
 * retry at a later SessionEnd; never silently drop a session).
 */
function gateFile(file: string): 'safe' | 'blocked' | 'unavailable' {
  const findings = scan(file, /* plaintext for masking */ true);
  if (findings === null) { debugLog('gitleaks unavailable — deferring seed of', file); return 'unavailable'; }
  if (findings.length === 0) return 'safe';

  let content: string;
  try { content = readFileSync(file, 'utf8') } catch { return 'blocked'; }
  for (const f of findings) {
    if (f.Secret) content = content.split(f.Secret).join('[REDACTED:secret]');
  }
  const dest = join(OVERLAY, relative(CORPUS, file));
  try {
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, content);
  } catch { return 'blocked'; }
  const verify = scan(dest, false);
  if (verify === null || verify.length > 0) {
    debugLog('overlay still dirty — refusing to seed', file);
    try { rmSync(dest, { force: true }) } catch {}
    return 'blocked';
  }
  return 'safe';
}

async function main() {
  let raw = '';
  try { raw = readFileSync(0, 'utf8') } catch {}
  let input: any = {};
  try { input = JSON.parse(raw) } catch {}
  const transcriptPath: string = input.transcript_path || '';

  // A. Conversation → ira-memory (independent of the seed gate; local DB only).
  const memProj = memoryProject();
  if (memProj) {
    const r = spawnSync('bun', ['run', 'src/cc-capture.ts'], {
      cwd: memProj, input: raw, encoding: 'utf8', timeout: 30_000,
      stdio: ['pipe', 'ignore', 'ignore'],
    });
    debugLog('cc-capture exit', r.status);
  } else {
    debugLog('ira-memory project not found — conversation capture skipped');
  }

  // B. Transcript → WORK ISA, gitleaks-gated, only for files inside the corpus.
  if (!transcriptPath || !existsSync(transcriptPath) || relative(CORPUS, transcriptPath).startsWith('..')) {
    debugLog('no corpus transcript to seed', transcriptPath);
    return;
  }
  if (!existsSync(SEEDER)) { debugLog('seeder missing', SEEDER); return; }

  // Gate every not-yet-checkpointed transcript in this project dir (usually just this session's),
  // because the seeder processes ALL unprocessed files matching --project in one run.
  let done = new Set<string>();
  try { done = new Set(JSON.parse(readFileSync(CHECKPOINT, 'utf8')).processed || []) } catch {}
  const projDir = dirname(transcriptPath);
  let pending: string[] = [];
  try {
    pending = readdirSync(projDir).filter(f => f.endsWith('.jsonl'))
      .map(f => join(projDir, f)).filter(f => !done.has(f));
  } catch { return; }

  const verdicts = pending.map(f => ({ f, v: gateFile(f) }));
  if (verdicts.some(x => x.v === 'unavailable')) {
    debugLog('gitleaks unavailable — seeding deferred to a later SessionEnd (nothing checkpointed)');
    return;
  }
  const safe = verdicts.filter(x => x.v === 'safe').map(x => x.f);
  const blocked = verdicts.filter(x => x.v === 'blocked').map(x => x.f);
  if (blocked.length > 0) {
    debugLog(`${blocked.length} transcript(s) failed the gate and will not be seeded`);
    // Checkpoint blocked files so the seeder never reads them raw; a future full
    // install --seed re-runs RedactCorpus and can pick them up via its own checkpoint.
    const updated = new Set(done);
    for (const f of blocked) updated.add(f);
    try { writeFileSync(CHECKPOINT, JSON.stringify({ processed: [...updated] }, null, 0)) } catch {}
  }
  if (safe.length === 0) return;

  const r = spawnSync('bun', [SEEDER,
    '--src', CORPUS, '--redacted', OVERLAY, '--out', WORK,
    '--project', basename(projDir), '--checkpoint', CHECKPOINT,
  ], { encoding: 'utf8', timeout: 25_000, stdio: ['ignore', 'pipe', 'ignore'] });
  debugLog('seeder', r.status, (r.stdout || '').trim());
}

await main();
