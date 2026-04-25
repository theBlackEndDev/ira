#!/usr/bin/env node
// UserPromptSubmit hook: routes prompts to the best-fit IRA agent.
//
// Layer 1 — regex on `triggers:` arrays in agents/*.md frontmatter (free, <50ms).
// Layer 2 — LLM fallback, fires ONLY when regex finds zero matches. ON by
//           default; opt out with IRA_ROUTER_LLM=0.
//           - Fast path (~500ms): set ANTHROPIC_API_KEY (run `claude
//             setup-token` once and export the token) for direct API calls.
//           - Slow path (~6-10s): if no key, shells out to the configured
//             binary (claude or codex) using --print. Heavyweight because the
//             full CLI loads on each call.
//
// Output is a HINT only — the orchestrator still chooses whether to delegate.
// Recursion guard: IRA_ROUTER_SKIP=1 is set when this hook spawns a CLI.
//
// Model resolution: reads agents/*.md `tier:` frontmatter field and maps to
// the correct model ID via model-map.json at the repo root.  If an agent has
// an explicit `model:` field, that wins for backward-compat (Claude users with
// pinned models are unaffected). The router's own LLM call uses tier 1 (cheap).

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { homedir } from 'os';
import { readEvent, writeOutput } from './lib/normalize.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AGENTS_DIR = join(__dirname, '..', '..', 'agents');
const MODEL_MAP_PATH = join(__dirname, '..', '..', 'model-map.json');

// Skill keywords already handled by keyword-detector — skip to avoid double-routing.
const SKILL_GUARD = /\b(ralph|autopilot|ultrawork|council|red[\s-]?team|research|plan|analyze|review|brainstorm|pr[\s-]?resolve|compound|anti[\s-]?slop|build|verify)\b/;

const HIGH_CONFIDENCE = 6;
const MEDIUM_CONFIDENCE = 3;

// ─── Model map (cached after first read) ─────────────────────────────────────

let _modelMap = null;

function loadModelMap() {
  if (_modelMap) return _modelMap;
  try {
    _modelMap = JSON.parse(readFileSync(MODEL_MAP_PATH, 'utf-8'));
  } catch {
    _modelMap = {};
  }
  return _modelMap;
}

/**
 * Resolve the model ID to use for a given agent and target.
 *
 * Priority:
 *   1. Agent's explicit `model:` frontmatter field (backward-compat for Claude users).
 *   2. Agent's `tier:` frontmatter field looked up in model-map.json for `target`.
 *   3. Fallback: tier 1 model for `target`.
 *
 * @param {{ model?: string, tier?: string }} fm — parsed agent frontmatter
 * @param {"claude"|"codex"} target
 * @returns {string} model ID
 */
function resolveModel(fm, target) {
  // Explicit model: field wins (backward-compat).
  if (fm.model && typeof fm.model === 'string' && fm.model.trim()) {
    return fm.model.trim();
  }

  const map = loadModelMap();
  const tier = (fm.tier || '1').toString().trim();
  const entry = map[tier] || map['1'] || {};
  return entry[target] || entry['claude'] || 'claude-haiku-4-5';
}

// ─── Config reader ────────────────────────────────────────────────────────────

function readPrimaryTarget() {
  if (process.env.IRA_TARGET) return process.env.IRA_TARGET;
  try {
    const configPath = join(homedir(), '.config', 'ira', 'config.jsonc');
    const raw = readFileSync(configPath, 'utf-8').replace(/\/\/.*/g, '').replace(/,\s*([}\]])/g, '$1');
    const config = JSON.parse(raw);
    return config.primary_target || 'claude';
  } catch { return 'claude'; }
}

// ─── Agent loading ────────────────────────────────────────────────────────────

function emit(obj) { console.log(JSON.stringify(obj)); }

function parseFrontmatter(content) {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const result = {};
  let currentKey = null;
  for (const line of m[1].split(/\r?\n/)) {
    if (/^\s+-\s+/.test(line) && currentKey) {
      const v = line.replace(/^\s+-\s+/, '').trim().replace(/^['"]|['"]$/g, '');
      if (Array.isArray(result[currentKey])) result[currentKey].push(v);
      continue;
    }
    const km = line.match(/^([a-zA-Z_-]+):\s*(.*)$/);
    if (!km) continue;
    const [, k, raw] = km;
    const v = raw.trim();
    if (v === '') {
      result[k] = [];
      currentKey = k;
    } else if (v.startsWith('[') && v.endsWith(']')) {
      try { result[k] = JSON.parse(v); } catch { result[k] = v; }
      currentKey = null;
    } else {
      result[k] = v.replace(/^['"]|['"]$/g, '');
      currentKey = null;
    }
  }
  return result;
}

function loadAgents() {
  if (!existsSync(AGENTS_DIR)) return [];
  const files = readdirSync(AGENTS_DIR).filter(f => f.endsWith('.md'));
  const agents = [];
  for (const f of files) {
    try {
      const content = readFileSync(join(AGENTS_DIR, f), 'utf-8');
      const fm = parseFrontmatter(content);
      if (!fm.name) continue;
      agents.push({
        name: fm.name,
        description: fm.description || '',
        triggers: Array.isArray(fm.triggers) ? fm.triggers : [],
        // Keep frontmatter for model resolution
        _fm: fm,
      });
    } catch { /* skip unreadable */ }
  }
  return agents;
}

// ─── Classification ───────────────────────────────────────────────────────────

function regexClassify(prompt, agents) {
  const scores = [];
  for (const a of agents) {
    if (a.triggers.length === 0) continue;
    const hits = [];
    for (const pat of a.triggers) {
      try {
        if (new RegExp(pat, 'i').test(prompt)) hits.push(pat);
      } catch { /* invalid regex in frontmatter */ }
    }
    if (hits.length === 0) continue;
    scores.push({ agent: a.name, score: hits.length * 2, hits });
  }
  scores.sort((a, b) => b.score - a.score);
  return scores;
}

function buildSystemPrompt(agents) {
  const catalog = agents.map(a => `- ${a.name}: ${a.description}`).join('\n');
  return `You are a routing classifier. Pick the single best agent for the user's prompt, or "none" if no agent fits well.

Available agents:
${catalog}

Respond ONLY with valid JSON like {"agent":"debugger","confidence":"high","reason":"user reports a bug"}. Confidence is one of: high, medium, low.`;
}

function extractJSON(text) {
  if (!text) return null;
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

async function llmClassifyDirect(prompt, agents, target) {
  const token = process.env.ANTHROPIC_API_KEY;
  if (!token) return null;

  // Use tier 1 (cheap/fast) for routing classification.
  const routerModel = resolveModel({ tier: '1' }, target);

  // OAuth tokens (sk-ant-oat...) from `claude setup-token` use Bearer auth.
  // API keys (sk-ant-api...) from console.anthropic.com use x-api-key header.
  const isOAuth = token.startsWith('sk-ant-oat');
  const headers = {
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
    ...(isOAuth
      ? { 'Authorization': `Bearer ${token}`, 'anthropic-beta': 'oauth-2025-04-20' }
      : { 'x-api-key': token }),
  };
  const body = {
    model: routerModel,
    max_tokens: 200,
    system: [{ type: 'text', text: buildSystemPrompt(agents), cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: `Route this prompt: "${prompt}"` }],
  };
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return extractJSON(data.content?.[0]?.text || '');
  } catch { return null; }
}

function llmClassifyCLI(prompt, agents, primaryBinary) {
  // Use tier 1 (cheap/fast) for routing. Model flag only applies to claude CLI;
  // codex CLI uses its own configured model.
  try {
    const cliArgs = primaryBinary === 'codex'
      ? [
          '--print',
          '--system-prompt', buildSystemPrompt(agents),
          '--no-session-persistence',
          `Route this prompt: "${prompt}"`,
        ]
      : [
          '--print',
          '--model', 'claude-haiku-4-5',
          '--system-prompt', buildSystemPrompt(agents),
          '--output-format', 'json',
          '--no-session-persistence',
          `Route this prompt: "${prompt}"`,
        ];

    const res = spawnSync(primaryBinary, cliArgs, {
      env: { ...process.env, IRA_ROUTER_SKIP: '1' },
      timeout: 12000,
      encoding: 'utf-8',
    });
    if (res.status !== 0 || !res.stdout) return null;

    // codex CLI output is plain text; claude CLI output is JSON when --output-format json
    if (primaryBinary === 'codex') {
      return extractJSON(res.stdout);
    }
    const out = JSON.parse(res.stdout);
    return extractJSON(out.result || '');
  } catch { return null; }
}

async function llmClassify(prompt, agents, primaryBinary, target) {
  if (process.env.ANTHROPIC_API_KEY) return await llmClassifyDirect(prompt, agents, target);
  return llmClassifyCLI(prompt, agents, primaryBinary);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (process.env.IRA_ROUTER_SKIP === '1') return emit({});

  const { target, event, payload } = await readEvent();

  const prompt = (payload.prompt || '').toString();
  if (!prompt.trim()) return emit({});

  const lower = prompt.toLowerCase();
  if (SKILL_GUARD.test(lower)) return emit({});

  const agents = loadAgents();
  if (agents.length === 0) return emit({});

  const scores = regexClassify(prompt, agents);
  const top = scores[0];
  const llmEnabled = process.env.IRA_ROUTER_LLM !== '0';
  const primaryBinary = readPrimaryTarget();

  let chosen, source, conf, reason;

  // Fast path: any regex hit at all wins. LLM only fires when regex finds NOTHING.
  // This keeps the common case sub-50ms and reserves the 6-7s LLM call for
  // genuine paraphrases the regex can't catch.
  if (top) {
    chosen = top.agent;
    source = 'regex';
    conf = top.score >= HIGH_CONFIDENCE ? 'high' : top.score >= MEDIUM_CONFIDENCE ? 'medium' : 'low';
    reason = `triggers: ${top.hits.slice(0, 3).join(', ')}`;
  } else if (llmEnabled) {
    const llm = await llmClassify(prompt, agents, primaryBinary, target);
    if (!llm || !llm.agent || llm.agent === 'none' || !agents.some(a => a.name === llm.agent)) {
      return emit({});
    }
    chosen = llm.agent;
    source = 'llm';
    conf = llm.confidence || 'medium';
    reason = llm.reason || 'semantic match';
  } else {
    return emit({});
  }

  const others = scores
    .filter(s => s.agent !== chosen)
    .slice(0, 2)
    .map(s => `${s.agent}(${s.score})`)
    .join(', ');

  // Resolve the chosen agent's model for informational context in the hint.
  const chosenAgent = agents.find(a => a.name === chosen);
  const resolvedModel = chosenAgent ? resolveModel(chosenAgent._fm, target) : '(unknown)';

  const hint = `[IRA ROUTE] Prompt matches: ${chosen} (${source}, confidence: ${conf}, model: ${resolvedModel}). ${reason}.${others ? ` Other candidates: ${others}.` : ''} Consider invoking via Agent tool.`;
  emit({ hookSpecificOutput: { additionalContext: hint } });
}

main().catch(() => emit({}));
