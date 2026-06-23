#!/usr/bin/env bun
/**
 * install.ts — deploy the GIRA packages to the chosen harness(es).
 *
 *   bun targets/gemini/install.ts [--target gemini|antigravity|both|auto] [--dry-run] [--no-generate]
 *
 * --target (default: auto)
 *   gemini       Gemini CLI extension  → ~/.gemini/extensions/gira
 *   antigravity  Antigravity plugin    → ~/.gemini/antigravity-cli/plugins/gira
 *   both         both
 *   auto         whichever CLIs are detected (binary on PATH, or the home dir present)
 *
 * Regenerates from v5 first (bun build.ts) unless --no-generate. Idempotent: removes any prior
 * gira AND a stale gira.bak before copying (the leftover-.bak dup-load bug from the first build).
 *
 * Gemini CLI substitutes ${extensionPath} in hooks.json itself, so that package ships as-is.
 * Antigravity does NOT substitute it, so for that variant we write a root-level hooks.json with
 * the hook command paths rewritten to the absolute install dir.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, rmSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

const HOME = homedir();
const HERE = import.meta.dir;
const DIST = join(HERE, 'dist');

const arg = (n: string, d = ''): string => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d;
};
const flag = (n: string) => process.argv.includes(`--${n}`);
const DRY = flag('dry-run');
const log = (tag: string, msg: string) => console.log(`  ${DRY ? '[dry] ' : ''}${tag.padEnd(10)} ${msg}`);

const GEMINI_DEST = join(HOME, '.gemini', 'extensions', 'gira');
const ANTIGRAV_DEST = join(HOME, '.gemini', 'antigravity-cli', 'plugins', 'gira');

function onPath(bin: string): boolean {
  return spawnSync('command', ['-v', bin], { shell: '/bin/bash', encoding: 'utf-8' }).status === 0;
}

/** Resolve --target into the concrete set, auto-detecting when asked. */
function resolveTargets(): Array<'gemini' | 'antigravity'> {
  const t = (arg('target', 'auto') || 'auto').toLowerCase();
  if (t === 'gemini') return ['gemini'];
  if (t === 'antigravity') return ['antigravity'];
  if (t === 'both') return ['gemini', 'antigravity'];
  // auto
  const out: Array<'gemini' | 'antigravity'> = [];
  if (onPath('gemini') || existsSync(join(HOME, '.gemini', 'extensions'))) out.push('gemini');
  if (onPath('antigravity') || existsSync(join(HOME, '.gemini', 'antigravity-cli'))) out.push('antigravity');
  return out;
}

/** Remove a prior install AND any leftover .bak that the CLI would also try to load. */
function clean(dest: string) {
  for (const p of [dest, `${dest}.bak`]) {
    if (existsSync(p)) { if (!DRY) rmSync(p, { recursive: true, force: true }); log('CLEAN', p); }
  }
}

function installGemini() {
  const src = join(DIST, 'gira-gemini');
  if (!existsSync(src)) { log('SKIP', `gemini: ${src} missing — run build first`); return; }
  clean(GEMINI_DEST);
  if (!DRY) { mkdirSync(join(GEMINI_DEST, '..'), { recursive: true }); cpSync(src, GEMINI_DEST, { recursive: true }); }
  log('GEMINI', `installed → ${GEMINI_DEST} (hooks.json keeps \${extensionPath}; Gemini CLI substitutes it)`);
}

function installAntigravity() {
  const src = join(DIST, 'gira-antigravity');
  if (!existsSync(src)) { log('SKIP', `antigravity: ${src} missing — run build first`); return; }
  clean(ANTIGRAV_DEST);
  if (!DRY) {
    mkdirSync(join(ANTIGRAV_DEST, '..'), { recursive: true });
    cpSync(src, ANTIGRAV_DEST, { recursive: true });
    // Antigravity doesn't substitute ${extensionPath}; write a root hooks.json with absolute paths.
    const hooksPath = join(ANTIGRAV_DEST, 'hooks', 'hooks.json');
    if (existsSync(hooksPath)) {
      const rewritten = readFileSync(hooksPath, 'utf-8').split('${extensionPath}').join(ANTIGRAV_DEST);
      writeFileSync(join(ANTIGRAV_DEST, 'hooks.json'), rewritten);
    }
  }
  log('ANTIGRAV', `installed → ${ANTIGRAV_DEST} (root hooks.json rewritten to absolute paths)`);
}

// ── Main ─────────────────────────────────────────────────────────────────────
console.log(`\n=== GIRA install${DRY ? ' (dry-run)' : ''} ===`);

if (!flag('no-generate')) {
  log('GENERATE', 'bun build.ts (regenerate from v5)');
  if (!DRY) {
    const r = spawnSync('bun', [join(HERE, 'build.ts')], { stdio: 'inherit' });
    if (r.status !== 0) { console.error('build failed — aborting install'); process.exit(1); }
  }
}

const targets = resolveTargets();
if (targets.length === 0) {
  console.error('No target detected. Pass --target gemini|antigravity|both, or install a Gemini/Antigravity CLI first.');
  process.exit(1);
}
log('TARGETS', targets.join(', '));
if (targets.includes('gemini')) installGemini();
if (targets.includes('antigravity')) installAntigravity();

console.log(`\n✓ GIRA installed for: ${targets.join(', ')}.`);
console.log('  Restart the CLI, then check: agents load without frontmatter errors, no duplicate-extension');
console.log('  warning, and a [GIRA MEMORY] recall block appears on your first substantive prompt.\n');
