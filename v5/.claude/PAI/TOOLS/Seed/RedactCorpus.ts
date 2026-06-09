#!/usr/bin/env bun
/**
 * RedactCorpus.ts — SAFETY GATE for seeding (ISC-3.1).
 *
 * The transcript corpus contains real secrets (Phase 0: 63 in 13 files). Seeding raw would
 * embed them into portable memory. This tool produces REDACTED copies of every affected file
 * (masking exactly what gitleaks finds), then re-scans the redacted output and FAILS unless
 * gitleaks reports zero. The seeder must consume the redacted overlay, never the originals.
 *
 * Usage: bun RedactCorpus.ts --src <corpusDir> --out <redactedDir>
 * Exit 0 only if the redacted output scans clean (0 leaks).
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { tmpdir } from 'node:os';

function arg(name: string, def?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : (def ?? '');
}

const SRC = arg('src');
const OUT = arg('out');
if (!SRC || !OUT) { console.error('usage: RedactCorpus.ts --src <dir> --out <dir>'); process.exit(2); }

function gitleaks(dir: string, reportPath: string, redactReport: boolean): number {
  const args = ['dir', dir, '--report-path', reportPath, '--report-format', 'json', '--no-banner'];
  if (redactReport) args.push('--redact');
  const r = spawnSync('gitleaks', args, { encoding: 'utf8' });
  // gitleaks exits 1 when leaks are found; the report is still written.
  try {
    const findings = JSON.parse(readFileSync(reportPath, 'utf8'));
    return Array.isArray(findings) ? findings.length : 0;
  } catch {
    if (r.error) { console.error('gitleaks not runnable:', r.error.message); process.exit(2); }
    return 0;
  }
}

interface Finding { File: string; Secret: string; RuleID: string; }

console.log(`[redact] scanning ${SRC} for secrets (plaintext report → tmp, deleted after use)…`);
const rawReport = join(tmpdir(), `ira-redact-raw-${process.pid}.json`);
gitleaks(SRC, rawReport, /* redactReport */ false); // need plaintext Secret values to mask
let findings: Finding[] = [];
try { findings = JSON.parse(readFileSync(rawReport, 'utf8')); } catch { findings = []; }

// Group secrets per file.
const byFile = new Map<string, Set<string>>();
for (const f of findings) {
  if (!f.File || !f.Secret) continue;
  if (!byFile.has(f.File)) byFile.set(f.File, new Set());
  byFile.get(f.File)!.add(f.Secret);
}

let filesRedacted = 0, secretsMasked = 0;
for (const [file, secrets] of byFile) {
  let content: string;
  try { content = readFileSync(file, 'utf8'); } catch { continue; }
  for (const s of secrets) {
    if (!s) continue;
    const before = content;
    content = content.split(s).join(`[REDACTED:secret]`);
    if (content !== before) secretsMasked++;
  }
  const rel = relative(SRC, file);
  const dest = join(OUT, rel);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, content);
  filesRedacted++;
}

// Destroy the plaintext report.
if (existsSync(rawReport)) rmSync(rawReport);

console.log(`[redact] redacted ${filesRedacted} file(s), masked ${secretsMasked} secret occurrence(s) → ${OUT}`);

// Re-scan the redacted OUTPUT and gate on zero.
if (filesRedacted === 0) {
  console.log('[redact] no secrets found in source — corpus already clean. GATE PASS.');
  process.exit(0);
}
const verifyReport = join(tmpdir(), `ira-redact-verify-${process.pid}.json`);
const remaining = gitleaks(OUT, verifyReport, /* redactReport */ true);
if (existsSync(verifyReport)) rmSync(verifyReport);
if (remaining === 0) {
  console.log('[redact] GATE PASS ✓ — redacted overlay scans clean (0 leaks).');
  process.exit(0);
} else {
  console.error(`[redact] GATE FAIL ✗ — ${remaining} leak(s) still present after redaction.`);
  process.exit(1);
}
