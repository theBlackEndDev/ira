#!/usr/bin/env bun
/**
 * build.ts — generate the GIRA packages (Gemini CLI extension + Antigravity plugin) FROM the
 * live v5/.claude tree. This is the anti-drift mechanism: gira is never hand-maintained, it is
 * always DERIVED from v5, so "rebuild against v5" == "re-run this generator".
 *
 *   bun targets/gemini/build.ts [--out <dir>] [--v5 <dir>]
 *
 * Outputs two packages under <out> (default targets/gemini/dist/):
 *   gira-gemini/      — Gemini CLI extension   (gemini-extension.json, commands/*.toml, GEMINI.md)
 *   gira-antigravity/ — Antigravity CLI plugin (plugin.json, commands folded into skills)
 * Both share: transformed agents/, the curated skills/ subset, and ported hooks/ (+ hooks.json).
 *
 * WHY a transform and not a copy: v5 agents carry Claude-only frontmatter (voice/persona/
 * disallowedTools) that Gemini REJECTS, v5 hooks are TypeScript that runs in Claude's process,
 * and v5 ships 59 skills incl. PAI-infra ones that have no meaning on Gemini. The generator
 * normalizes all of that. Known Gemini gotchas (captured from the original gira build) are baked
 * in: strip tier/disallowedTools from agents, namespace commands that collide with built-ins.
 */
import {
  readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, rmSync, cpSync, statSync,
} from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';

const arg = (n: string, d = ''): string => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};

const ROOT = resolve(import.meta.dir, '..', '..');                 // the ira repo root
const V5 = resolve(arg('v5', join(ROOT, 'v5', '.claude')));
const OUT = resolve(arg('out', join(import.meta.dir, 'dist')));
const TEMPLATES = join(import.meta.dir, 'templates');
const MODEL_MAP = JSON.parse(readFileSync(join(import.meta.dir, 'model-map.json'), 'utf8'));
const VERSION = (() => {
  try { return JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version || '0.0.0'; }
  catch { return '0.0.0'; }
})();

const log = (tag: string, msg: string) => console.log(`  ${tag.padEnd(10)} ${msg}`);

// ── Curated skill subset ─────────────────────────────────────────────────────
// v5 ships 59 skills; only those that are self-contained and meaningful on a Gemini harness are
// emitted. EXCLUDED: PAI infra (Pulse/Daemon/Arbol/Observability/PAIUpgrade/Telos/Interview),
// vendor/tool-bound (Apify/BrightData/Browser/Interceptor/Remotion/Art/AudioEditor/Fabric),
// and Claude-loop-specific (Agents/Delegation/ISA). Edit this list to tune coverage.
const SKILLS = [
  // execution / quality
  'build', 'plan', 'analyze', 'review', 'verify', 'ralph', 'autopilot', 'anti-slop',
  'brainstorm', 'compound', 'cancel', 'pr-resolve', 'ultrawork', 'git-ops',
  // reasoning
  'Council', 'RedTeam', 'FirstPrinciples', 'SystemsThinking', 'BeCreative', 'Ideate',
  'ApertureOscillation', 'IterativeDepth', 'RootCauseAnalysis',
  // research / knowledge / authoring
  'Research', 'ContextSearch', 'ExtractWisdom', 'Prompting', 'WriteStory',
  'CreateSkill', 'CreateCLI',
];

// Skill/command names that collide with Gemini CLI built-ins or each other → namespace them.
// (From the original gira build: /plan and /review clashed with built-ins and got auto-renamed.)
const NAMESPACE_PREFIX = 'gira';
const COLLIDING = new Set(['plan', 'review', 'compress', 'init', 'help', 'status', 'chat']);

// ── Frontmatter helpers ──────────────────────────────────────────────────────
interface Parsed { fm: Record<string, any>; body: string; }

/** Minimal YAML-frontmatter parse — flat keys, inline arrays, and nested `- item` lists.
 *  Nested MAP blocks (voice:/persona:/permissions:) are captured as "__BLOCK__" and dropped. */
function parseFrontmatter(text: string): Parsed {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { fm: {}, body: text };
  const fm: Record<string, any> = {};
  const lines = m[1].split('\n');
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (/^\s/.test(raw)) continue;                        // indented → consumed by look-ahead below
    const kv = raw.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    let v: any = kv[2].trim();
    if (v === '') {
      // Empty value → look ahead. `  - x` lines = a list; anything else indented = a map block.
      const items: string[] = [];
      let j = i + 1;
      while (j < lines.length && /^\s+-\s+/.test(lines[j])) {
        items.push(lines[j].replace(/^\s+-\s+/, '').trim().replace(/^["']|["']$/g, ''));
        j++;
      }
      if (items.length) { fm[key] = items; i = j - 1; }
      else fm[key] = '__BLOCK__';                          // nested map (voice/persona/permissions)
      continue;
    }
    if (/^\[.*\]$/.test(v)) {
      v = v.slice(1, -1).split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    } else {
      v = v.replace(/^["']|["']$/g, '');
    }
    fm[key] = v;
  }
  return { fm, body: m[2] };
}

function yamlValue(v: any): string {
  if (Array.isArray(v)) return `[${v.map((x) => JSON.stringify(x)).join(', ')}]`;
  if (typeof v === 'string' && /[:#"']/.test(v)) return JSON.stringify(v);
  return String(v);
}
function emitFrontmatter(fm: Record<string, any>, body: string): string {
  const lines = Object.entries(fm).map(([k, v]) => `${k}: ${yamlValue(v)}`);
  return `---\n${lines.join('\n')}\n---\n${body.startsWith('\n') ? '' : '\n'}${body}`;
}

// Gemini's built-in tool names (allowlist vocabulary). A v5 read-only agent (Write/Edit in its
// disallowedTools) maps to the read-only slice; everything else gets the full set ("*").
const GEMINI_READONLY_TOOLS = ['read_file', 'read_many_files', 'grep_search', 'glob', 'web_fetch'];

function mapModel(v5model: string): string {
  return MODEL_MAP[v5model] || MODEL_MAP._default;
}

/** v5 agent .md → Gemini agent .md. Drops Claude-only keys, converts denylist→allowlist. */
function transformAgent(text: string): string {
  const { fm, body } = parseFrontmatter(text);
  const denied = Array.isArray(fm.disallowedTools) ? fm.disallowedTools : [];
  const isReadOnly = denied.includes('Write') || denied.includes('Edit');
  const out: Record<string, any> = {
    name: String(fm.name || '').toLowerCase(),    // Gemini invokes agents by lowercase name
    description: fm.description,
    model: mapModel(String(fm.model || '')),
    tools: isReadOnly ? GEMINI_READONLY_TOOLS : ['*'],
  };
  if (fm.maxTurns) out.max_turns = Number(fm.maxTurns);
  // Dropped (Claude/PAI-only, Gemini rejects or ignores): voice, voiceId, persona, color,
  // isolation, permissions, disallowedTools, initialPrompt, skills.
  return emitFrontmatter(out, body.trim() + '\n');
}

// ── Build steps ──────────────────────────────────────────────────────────────
function freshDir(d: string) { rmSync(d, { recursive: true, force: true }); mkdirSync(d, { recursive: true }); }

function buildAgents(pkgDir: string): number {
  const src = join(V5, 'agents');
  const dst = join(pkgDir, 'agents'); mkdirSync(dst, { recursive: true });
  let n = 0;
  for (const f of readdirSync(src).filter((f) => f.endsWith('.md'))) {
    // Gemini agent names are lowercase-kebab by convention; lower the filename.
    const name = basename(f, '.md').toLowerCase();
    writeFileSync(join(dst, `${name}.md`), transformAgent(readFileSync(join(src, f), 'utf8')));
    n++;
  }
  return n;
}

function buildSkills(pkgDir: string): { count: number; renamed: string[] } {
  const src = join(V5, 'skills');
  const dst = join(pkgDir, 'skills'); mkdirSync(dst, { recursive: true });
  const renamed: string[] = [];
  let count = 0;
  for (const s of SKILLS) {
    const skillDir = join(src, s);
    if (!existsSync(join(skillDir, 'SKILL.md'))) { log('WARN', `skill not found in v5: ${s}`); continue; }
    let name = s.toLowerCase();
    if (COLLIDING.has(name)) { const renamedTo = `${NAMESPACE_PREFIX}-${name}`; renamed.push(`${name}→${renamedTo}`); name = renamedTo; }
    cpSync(skillDir, join(dst, name), { recursive: true });
    count++;
  }
  return { count, renamed };
}

/** Compose GEMINI.md: the IRA behavioral contract, Gemini-adapted. Sourced from v5 CLAUDE.md with
 *  Claude/PAI-only mechanics stripped (Pulse voice curls, PAI/ file-path reads, Forge tier bindings). */
function buildGeminiMd(pkgDir: string): void {
  let src = '';
  try { src = readFileSync(join(V5, 'CLAUDE.md'), 'utf8'); } catch { src = ''; }
  const stripped = src
    .replace(/^.*curl -sk[^\n]*\n/gm, '')                      // Pulse voice curls (:31337)
    .replace(/\*\*Voice:\*\*[^\n]*\n/gm, '')
    .replace(/^.*\bForge\b.*$/gm, '')                          // Claude-only Forge tier bindings
    .replace(/\n{3,}/g, '\n\n');
  const header = `# GIRA — Gemini Intelligent Reasoning Assistant

> Generated from the IRA v5 (PAI 5.0) tree by targets/gemini/build.ts. Do not edit by hand —
> edit the v5 source and regenerate. GIRA is IRA's behavioral contract adapted to Gemini CLI.

> **Harness note:** GIRA runs on Gemini CLI / Antigravity. Memory + recall use the local
> ira-memory API on \`http://127.0.0.1:7775\` (same backend as IRA on Claude). The Ralph
> stop-loop is NOT enforceable here — Gemini CLI has no Stop-veto hook — so \`ralph\` degrades to
> best-effort guidance rather than a hard completion gate. Everything else (recall, capture,
> ISC, complexity classification) is at parity.

`;
  writeFileSync(join(pkgDir, 'GEMINI.md'), header + stripped.trim() + '\n');
}

function buildHooks(pkgDir: string): void {
  const tHooks = join(TEMPLATES, 'hooks');
  if (!existsSync(tHooks)) { log('WARN', 'no hook templates yet — skipping hooks'); return; }
  cpSync(tHooks, join(pkgDir, 'hooks'), { recursive: true });
}

function buildCommands(pkgDir: string): void {
  const tCmds = join(TEMPLATES, 'commands');
  if (!existsSync(tCmds)) return;
  cpSync(tCmds, join(pkgDir, 'commands'), { recursive: true });
}

// ── Package emitters ─────────────────────────────────────────────────────────
function emitGeminiExtension(): void {
  const pkg = join(OUT, 'gira-gemini'); freshDir(pkg);
  const agents = buildAgents(pkg);
  const { count, renamed } = buildSkills(pkg);
  buildGeminiMd(pkg);
  buildHooks(pkg);
  buildCommands(pkg);
  writeFileSync(join(pkg, 'gemini-extension.json'), JSON.stringify({
    name: 'gira',
    version: VERSION,
    description: 'GIRA — IRA (PAI 5.0) for Gemini CLI: structured QA, project-scoped memory recall, ISC quality system',
    contextFileName: 'GEMINI.md',
  }, null, 2) + '\n');
  log('GEMINI', `${pkg}  (agents=${agents}, skills=${count}${renamed.length ? `, renamed=${renamed.join(',')}` : ''})`);
}

function emitAntigravityPlugin(): void {
  const pkg = join(OUT, 'gira-antigravity'); freshDir(pkg);
  const agents = buildAgents(pkg);
  const { count } = buildSkills(pkg);
  buildGeminiMd(pkg);
  buildHooks(pkg);
  // Antigravity folds commands into skills (no commands/*.toml) and uses plugin.json.
  writeFileSync(join(pkg, 'plugin.json'), JSON.stringify({
    name: 'gira',
    version: VERSION,
    description: 'GIRA — IRA (PAI 5.0) for Antigravity CLI',
  }, null, 2) + '\n');
  log('ANTIGRAV', `${pkg}  (agents=${agents}, skills=${count})`);
}

// ── Main ─────────────────────────────────────────────────────────────────────
console.log(`\n=== GIRA generator — v5 → Gemini/Antigravity (v${VERSION}) ===`);
if (!existsSync(join(V5, 'agents'))) { console.error(`v5 tree not found at ${V5}`); process.exit(1); }
log('SOURCE', V5);
log('OUT', OUT);
emitGeminiExtension();
emitAntigravityPlugin();
console.log('\n✓ Generated. Install with: targets/gemini/install.sh (or via `bun run update`).\n');
