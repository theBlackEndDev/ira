# PAI to IRA Migration Guide

## Overview

The migration script transfers all accumulated data from a PAI installation into IRA's directory structure. It handles local migrations, remote harvesting via SSH/rsync, and merging data from multiple machines.

**The source PAI installation is never modified.**

## Quick Start

```bash
# Local migration (most common)
bun run scripts/migrate-from-pai.ts --source ~/.claude

# Preview what would be migrated
bun run scripts/migrate-from-pai.ts --source ~/.claude --dry-run

# Verbose output
bun run scripts/migrate-from-pai.ts --source ~/.claude --verbose
```

## What Gets Migrated

| PAI Source | IRA Destination | Notes |
|---|---|---|
| `MEMORY/LEARNING/REFLECTIONS/algorithm-reflections.jsonl` | `.ira/learning/reflections/` | JSONL, deduplicated by timestamp |
| `MEMORY/LEARNING/FAILURES/` | `.ira/learning/failures/` | All failure dump files |
| `MEMORY/LEARNING/SIGNALS/` | `.ira/learning/` | Rating signals |
| `MEMORY/LEARNING/SYNTHESIS/` | `.ira/learning/synthesis/` | Synthesis files |
| `MEMORY/WORK/**/*PRD.md` | `.ira/work/` | Frontmatter converted (PAI refs become IRA) |
| `PAI/USER/TELOS/` | `.ira/telos/` | Goals, beliefs, wisdom, books, etc. |
| `PAI/USER/AISTEERINGRULES.md` | `.ira/user/steering-rules.md` | Renamed |
| `PAI/USER/ABOUTME.md` | `.ira/user/about.md` | Renamed |
| `PAI/USER/OPINIONS.md` | `.ira/user/opinions.md` | Renamed |
| `PAI/USER/WRITINGSTYLE.md` | `.ira/user/writing-style.md` | Renamed |
| `PAI/USER/SKILLCUSTOMIZATIONS/` | `.ira/user/skill-overrides/` | All customization files |
| `MEMORY/STATE/events.jsonl` | `.ira/events.jsonl` | Appended and deduplicated |
| `MEMORY/STATE/work.json` | `.ira/state/work.json` | Direct copy |
| `.claude/projects/*/memory/*.md` | `.ira/memory/projects/` | Organized by project slug |

## Remote Harvesting

Harvest data from a remote machine via SSH and rsync.

### Prerequisites

- SSH key-based authentication configured for the remote host
- `rsync` installed on both machines
- The remote user has read access to `~/.claude/`

### Harvest Only (inspect before migrating)

```bash
# Download to /tmp without modifying local IRA
bun run scripts/migrate-from-pai.ts --source user@server:~/.claude --harvest-only

# Inspect what was downloaded
ls /tmp/ira-harvest-server/

# Then run the full migration from the harvested data
bun run scripts/migrate-from-pai.ts --source /tmp/ira-harvest-server/
```

### Direct Remote Migration

```bash
bun run scripts/migrate-from-pai.ts --source user@server:~/.claude
```

## Multi-Machine Merge

Merge PAI data from multiple machines into a single IRA installation.

```bash
bun run scripts/migrate-from-pai.ts \
  --source user@workstation:~/.claude \
  --source user@laptop:~/.claude \
  --source ~/.claude \
  --merge-learnings
```

### Merge Strategy

| Data Type | Strategy |
|---|---|
| JSONL files (reflections, events) | Concatenate, sort by timestamp, deduplicate |
| Rating signals | Merge all, compute aggregate stats |
| TELOS files | Keep newest version (by file modification time) |
| PRD files | Keep all (unique by path/slug) |
| Project memory | Keep all; prefix with machine hostname on name collision |
| Failure dumps | Keep all; prefix with machine hostname on collision |

## CLI Reference

```
Usage: migrate-from-pai [options]

Options:
  --source <path>       PAI source (local path or user@host:path). Can specify multiple.
  --target <path>       IRA target directory (default: .ira/)
  --harvest-only        Only harvest data, don't install into IRA
  --merge-learnings     Merge learnings from multiple sources
  --dry-run             Show what would be migrated without doing it
  --verbose             Show detailed progress
  --help                Show help
```

## Troubleshooting

### SSH Connection Failures

**Symptom:** `rsync` hangs or fails with "Permission denied"

1. Verify SSH access works: `ssh user@server echo ok`
2. Ensure SSH key is loaded: `ssh-add -l`
3. If using a non-standard port, configure it in `~/.ssh/config`:
   ```
   Host server
     HostName server.example.com
     Port 2222
     User youruser
   ```

### Permission Errors on Source

**Symptom:** Migration reports 0 files for a category you know exists

1. Check the source path is correct — it should point to the `.claude` directory (not a subdirectory)
2. Verify file permissions: `ls -la ~/.claude/MEMORY/`
3. For remote sources, verify the remote user can read the files: `ssh user@server ls ~/.claude/MEMORY/`

### rsync Not Found

Install rsync:
- macOS: `brew install rsync`
- Ubuntu/Debian: `sudo apt install rsync`
- Fedora: `sudo dnf install rsync`

### Partial Migration

If migration is interrupted, re-run the same command. The script handles:
- JSONL files: deduplicates by timestamp, so re-runs are safe
- Regular files: overwrites with source version
- Multi-machine: uses hostname prefix to avoid collisions

### Target Directory Already Has Data

The script merges into existing data rather than overwriting:
- JSONL files are appended and deduplicated
- TELOS files use "newest wins" strategy
- Other files are overwritten with the source version

To start fresh, remove the target directory first:
```bash
rm -rf .ira/
bun run scripts/migrate-from-pai.ts --source ~/.claude
```

### Dry Run Shows Nothing

If `--dry-run` reports 0 for all categories:
1. Verify the source path: `ls ~/.claude/MEMORY/LEARNING/`
2. The script expects the PAI directory structure — if your installation uses different paths, the source should be the parent directory containing `MEMORY/` and `PAI/`
