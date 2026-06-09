# IRA overlay on PAI 5.0

IRA is built on the PAI 5.0 foundation (see `CLAUDE.md`, `PAI/`). This file records the
IRA-specific decisions layered on top. Re-skin of PAI/DA→IRA identity is tracked by ISC-1.1.

## Runtime decision (ISC-1.9)
**Bun, everywhere.** PAI is Bun-only by design (`bun:sqlite`, `Bun.serve`, `#!/usr/bin/env bun`
on every hook). IRA keeps that — all v5 hooks and tools run under Bun. The one portability
guarantee: `hooks/lib/platform.ts` (the cross-platform seam) is written in node+Bun-compatible
builtins and is verified to run under BOTH `bun` and `node`, so platform logic never depends on
Bun-only APIs. Installers must provision Bun on macOS and Linux.

## Skill composition (ISC-1.6 / ISC-1.7)
IRA's 3-layer composition model is preserved via each skill's `layer:` + `level:` frontmatter:

```
GUARANTEE (wraps everything):  ralph · verify · autopilot
ENHANCEMENT (additive):        ultrawork · git-ops · anti-slop · compound · cancel
EXECUTION (primary):           build · plan · review · analyze · brainstorm · pr-resolve
                               (+ research · council · red-team — see overlap note)
Composition: [Execution] + [0-N Enhancement] + [Optional Guarantee]
```

### 17-skill roster in v5
- **14 IRA-unique skills ported** verbatim (layer/level intact):
  analyze, anti-slop, autopilot, brainstorm, build, cancel, compound, git-ops, plan,
  pr-resolve, ralph, review, ultrawork, verify  → `skills/<name>/SKILL.md`.
- **3 overlaps adopted from PAI's richer multi-agent versions** (research→Research,
  council→Council, red-team→RedTeam). Rationale: (a) PAI's are strictly more capable
  (multi-model, verified-URL, parallel-explorer); (b) avoids a case-only directory collision
  (`research` vs `Research`) that would break on macOS's case-insensitive filesystem. No
  capability lost — the keyword still triggers, now backed by the superset implementation.

## Cross-platform (ISC-1.2–1.5, 1.10)
All OS-specific behavior routes through `hooks/lib/platform.ts`:
- service manager: launchd (mac) / systemd --user (linux)
- voice/notify/audio: say+afplay+osascript (mac) / espeak+mpg123|mpv+notify-send (linux) / log (headless)
- `voice.ts` (Pulse) refactored to use the adapter for playback + notifications.
- Deferred to Phase 5 installer (replaced by adapter.installService): `PULSE/manage.sh`,
  `PULSE/setup.ts`, `PULSE/MenuBar/install.sh` launchctl calls.
- macOS-only by design (gated, no Linux path): `PULSE/lib/imessage-send.ts`, MenuBar Swift app.
- Timezone placeholder crash fixed defensively in `hooks/lib/time.ts` (UTC fallback).

## Follow-ups (tracked, non-blocking)
- Gate `PULSE/pulse.ts` iMessage import behind `process.platform === 'darwin'` (audit M).
- Remove now-dead `escapeForAppleScript` in `voice.ts` (anti-slop phase).
