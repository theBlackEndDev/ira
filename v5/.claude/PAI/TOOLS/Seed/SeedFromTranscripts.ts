#!/usr/bin/env bun
/**
 * SeedFromTranscripts.ts — turn historical Claude transcripts into PAI WORK ISA artifacts (ISC-3.2/3.3).
 *
 * ADDITIVE: writes filesystem artifacts only. Never touches :7775 / pgvector (existing facts stay).
 * SAFE: for any file with a redacted overlay (RedactCorpus.ts output), reads the redacted copy.
 * RESUMABLE + DEDUP: a checkpoint records processed session files; re-running adds no duplicates.
 * FULL-DETAIL: extracts user/assistant text turns (tool calls/results filtered as noise) and writes
 * them verbatim into the ISA — no lossy LLM re-summarization.
 *
 * Usage:
 *   bun SeedFromTranscripts.ts --src ~/.claude/projects --redacted <overlay> --out <workDir> \
 *       [--project <slug>] [--limit N] [--checkpoint <file>]
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join, relative, basename } from 'node:path';
import { homedir } from 'node:os';

function arg(name: string, def = ''): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const SRC = arg('src', join(homedir(), '.claude', 'projects'));
const REDACTED = arg('redacted', '');
const OUT = arg('out', join(process.env.PAI_DIR || join(homedir(), '.claude', 'PAI'), 'MEMORY', 'WORK'));
const PROJECT = arg('project', '');
const LIMIT = parseInt(arg('limit', '0'), 10) || 0;
const CKPT = arg('checkpoint', join(OUT, '.seed-checkpoint.json'));

const MAX_TURN = 2000;       // cap a single turn
const MAX_BODY = 40000;      // cap total transcript per ISA
const MIN_TURNS = 2;         // skip trivial sessions

function loadCheckpoint(): Set<string> {
  try { return new Set(JSON.parse(readFileSync(CKPT, 'utf8')).processed || []); } catch { return new Set(); }
}
function saveCheckpoint(done: Set<string>) {
  mkdirSync(join(CKPT, '..'), { recursive: true });
  writeFileSync(CKPT, JSON.stringify({ processed: [...done] }, null, 0));
}

function listSessionFiles(): string[] {
  const out: string[] = [];
  let projDirs: string[];
  try { projDirs = readdirSync(SRC, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name); }
  catch { return []; }
  for (const pd of projDirs) {
    if (PROJECT && !pd.includes(PROJECT)) continue;
    const dir = join(SRC, pd);
    let files: string[] = [];
    try { files = readdirSync(dir).filter(f => f.endsWith('.jsonl')); } catch { continue; }
    for (const f of files) out.push(join(dir, f));
  }
  return out;
}

/** Read the redacted overlay if one exists for this file, else the original. */
function effectivePath(file: string): string {
  if (!REDACTED) return file;
  const rel = relative(SRC, file);
  const overlay = join(REDACTED, rel);
  return existsSync(overlay) ? overlay : file;
}

function textFromContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((b: any) => b && b.type === 'text' && typeof b.text === 'string')
      .map((b: any) => b.text)
      .join('\n');
  }
  return '';
}

interface Turn { role: string; text: string; }

/** Claude Code injects command/hook/caveat wrappers as "user" turns — not real conversation. */
function isNoise(text: string): boolean {
  const t = text.trimStart();
  return (
    t.startsWith('<local-command') ||
    t.startsWith('<command-') ||
    t.startsWith('<bash-') ||
    t.startsWith('<system-reminder') ||
    t.startsWith('<user-prompt-submit-hook') ||
    t.startsWith('Caveat:') ||
    t.startsWith('[Request interrupted')
  );
}

function extractTurns(file: string): { turns: Turn[]; sessionId: string } {
  const turns: Turn[] = [];
  let sessionId = basename(file).replace(/\.jsonl$/, '');
  let raw = '';
  try { raw = readFileSync(file, 'utf8'); } catch { return { turns, sessionId }; }
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let ev: any;
    try { ev = JSON.parse(line); } catch { continue; }
    if (ev.sessionId) sessionId = ev.sessionId;
    if (ev.type !== 'user' && ev.type !== 'assistant') continue;        // skip mode/system/summary
    const role = ev.message?.role || ev.type;
    let text = textFromContent(ev.message?.content).trim();             // tool_use/tool_result dropped
    if (!text || isNoise(text)) continue;                               // skip CC command/hook/caveat wrappers
    if (text.length > MAX_TURN) text = text.slice(0, MAX_TURN) + ' …[turn truncated]';
    turns.push({ role, text });
  }
  return { turns, sessionId };
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'session';
}

function tsFromFile(file: string): string {
  try {
    const d = statSync(file).mtime;
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  } catch { return '20260101-000000'; }
}

function main() {
  const done = loadCheckpoint();
  const seenSessions = new Set<string>();
  const files = listSessionFiles();
  let processed = 0, written = 0, skipped = 0;

  for (const file of files) {
    if (LIMIT && processed >= LIMIT) break;
    if (done.has(file)) continue;
    processed++;
    const project = basename(join(file, '..'));
    const { turns, sessionId } = extractTurns(effectivePath(file));
    done.add(file);

    if (turns.length < MIN_TURNS || seenSessions.has(sessionId)) { skipped++; continue; }
    seenSessions.add(sessionId);

    const firstUser = turns.find(t => t.role === 'user')?.text || turns[0].text;
    const title = firstUser.replace(/\s+/g, ' ').slice(0, 72);
    const slug = slugify(title);
    const ts = tsFromFile(file);
    const dir = join(OUT, `${ts}_${slug}`);
    if (existsSync(join(dir, 'ISA.md'))) { skipped++; continue; }   // dedup by artifact path

    let body = '';
    for (const t of turns) {
      const next = `\n**${t.role}:** ${t.text}\n`;
      if (body.length + next.length > MAX_BODY) { body += '\n…[transcript truncated]\n'; break; }
      body += next;
    }

    const isa = `---
id: ISA-${ts}-${slug}
title: "${title.replace(/"/g, "'")}"
session_id: ${sessionId}
status: SEEDED
source: transcript-seed
project: ${project}
---
# ${title}

## CONTEXT
Seeded from historical transcript \`${basename(file)}\` (project: ${project}).
This artifact preserves the session's user/assistant turns verbatim (tool noise filtered) so the
full detail is recoverable — not a sparse summary.

## TRANSCRIPT
${body}
`;
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'ISA.md'), isa);
    written++;
  }

  saveCheckpoint(done);
  console.log(JSON.stringify({ scanned: files.length, processed, written, skipped, out: OUT }, null, 0));
}

main();
