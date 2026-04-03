---
name: git-ops
description: USE WHEN performing git operations — commits, branches, PRs, merges. Enforces consistent formatting and safe workflows.
layer: enhancement
level: 3
---

# Git Ops

## What This Skill Does
Git-ops manages all git workflow operations with consistent formatting, safe defaults, and proper descriptions. It handles commits, branches, PRs, and merge conflicts while preventing destructive operations.

## When to Use
- Committing changes after implementation
- Creating or switching branches
- Creating pull requests
- Resolving merge conflicts
- Any git operation beyond basic status/diff

## How It Works

### Commit Formatting
1. Stage only relevant files — never use `git add -A` or `git add .`
2. Review staged changes with `git diff --cached`
3. Generate commit message following conventional format:
   ```
   type(scope): concise description

   - Detail bullet 1
   - Detail bullet 2

   Co-Authored-By: [agent identity]
   ```
4. Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `style`
5. Scope: the module, component, or area affected
6. Description: imperative mood, under 72 characters, no period

### Branch Management
1. Branch naming: `type/description-in-kebab-case`
   - `feat/add-user-authentication`
   - `fix/resolve-null-pointer-in-parser`
   - `refactor/extract-service-layer`
2. Always branch from the latest main/master unless specified otherwise
3. Before creating a branch, fetch and check for remote conflicts

### PR Creation
1. Title: matches the primary commit message type and description
2. Body structure:
   ```
   ## Summary
   [2-4 bullets describing what changed and why]

   ## Changes
   [File-level or component-level change list]

   ## Test Plan
   [How to verify the changes work]

   ## ISC Criteria Met
   [If ralph was used, list the criteria and evidence]
   ```
3. Assign reviewers if team configuration is available
4. Add labels based on commit type (feat -> enhancement, fix -> bug, etc.)

### Merge Conflict Resolution
1. Identify conflicting files with `git diff --name-only --diff-filter=U`
2. For each conflict:
   - Read both sides of the conflict markers
   - Determine intent of each change
   - If both changes are independent additions: keep both
   - If changes modify the same logic: prefer the branch being merged in, flag for review
   - If unclear: do not auto-resolve, present both options to user
3. After resolution, run verify to confirm nothing broke

### Safety Rules
- NEVER force push to main/master
- NEVER use `--no-verify` to skip hooks
- NEVER use `git reset --hard` without explicit user confirmation
- NEVER amend commits that have been pushed to remote
- Always check `git status` before and after operations
- Warn if committing files that match `.gitignore` patterns
- Warn if staging files that look like secrets (`.env`, `credentials.*`, `*_key*`)

### Stash Management
- Before switching branches with uncommitted changes: `git stash push -m "context: description"`
- After switching back: remind about stashed changes
- Never leave unnamed stashes

## Composition
- **Called by**: ralph (for committing verified work), build (post-implementation)
- **Calls**: No other skills
- **Works with**: anti-slop (cleanup before commit), verify (confirmation after merge)
