# Cutover & Rollback — IRA on PAI 5.0

> Status: build complete on `rebuild/pai5`, all tests green, `main` + live global `~/.claude` UNTOUCHED.
> The cutover below is an **operator-gated** step (ISC-6.6). Nothing here runs automatically.

## ⚠️ The symlink caveat (read first)
Your live `~/.claude/CLAUDE.md` currently **symlinks into this repo** (`→ ira/CLAUDE.md`, the *old* IRA),
and `~/.claude/settings.json` references `ira/hooks/scripts/*.mjs`. The cutover replaces that with the
new `v5/.claude` tree. So **back up `~/.claude` first** — this is the one irreversible-feeling step.

## Pre-cutover backup (do this, every time)
```bash
tar czf ~/ira-claude-backup-$(date +%Y%m%d).tgz -C ~ .claude
# DB is already backed up: .ira/phase0/backup/ira_memory_*.sql (402 MB, 4,684 facts)
```

## Cutover (when you approve)
```bash
# 1. Install the v5 tree to your real home (overwrites ~/.claude with the PAI-5.0 IRA)
bun v5/.claude/PAI/TOOLS/Install/install.ts --home ~ --start-daemons

# 2. Seed memory from history (gated; redaction must reach gitleaks-0 first)
bun v5/.claude/PAI/TOOLS/Install/install.ts --home ~ --seed       # full corpus, resumable

# 3. Smoke-test a REAL session: open Claude Code, confirm SessionStart loads the full active ISA,
#    a recall block appears on a prompt, and a rating row lands in MEMORY/LEARNING/SIGNALS/ratings.jsonl.

# 4. Only then: merge the branch
git checkout main && git merge rebuild/pai5
```
`:7775` (ira-memory) is **kept** — recall points at it; nothing about cutover touches the DB.

## Rollback (if anything is wrong)
```bash
# A. Restore the previous global config
rm -rf ~/.claude && tar xzf ~/ira-claude-backup-YYYYMMDD.tgz -C ~

# B. Restore the repo working tree
git checkout main          # (branch rebuild/pai5 stays for retry)

# C. ira-memory is unchanged; if its container was stopped: docker compose up -d
```
Rollback is a file restore + a branch checkout — no data migration to reverse (seeding was additive;
the 4,684 pgvector facts were never modified).

## Rehearsal
Rollback has been rehearsed in a sandbox home (install → verify tree present → remove → verify clean).
See `tests/` for the E2E + platform + learning regressions that gate the cutover.
