---
name: cancel
description: USE WHEN the user wants to stop an active mode (ralph, autopilot, ultrawork). Deactivates the named mode.
layer: enhancement
level: 1
---

# Cancel

## What This Skill Does
Cancel deactivates an active mode by updating its state file. It handles ralph, autopilot, ultrawork, and any other mode that persists state in `.ira/state/`. This is the only way to cleanly exit a stop-hook-enforced mode like ralph or autopilot.

## When to Use
- User says "cancel ralph", "cancel autopilot", "cancel ultrawork"
- User says "cancel all" or "cancel everything"
- User wants to abort an in-progress pipeline or loop
- Any time the user explicitly requests stopping an active mode

## How It Works

### Step 1: Parse the Target Mode
1. Extract the mode name from the user's prompt (e.g., "cancel ralph" -> `ralph`)
2. If no specific mode is named, proceed to Step 3 (list active modes)

### Step 2: Deactivate the Mode
1. Read `.ira/state/{mode}-state.json`
2. Update the state:
   ```json
   {
     "active": false,
     "cancelledAt": "2026-04-04T...",
     "stoppedReason": "user_cancel"
   }
   ```
3. Write the updated state back to the file
4. Confirm cancellation to the user

### Step 3: No Mode Specified
1. Scan `.ira/state/` for all `*-state.json` files
2. Filter to those with `"active": true`
3. List active modes to the user
4. Ask which one to cancel

### Special Case: Cancel All
If the user says "cancel all" or "cancel everything":
1. Scan `.ira/state/` for all `*-state.json` files
2. For each file with `"active": true`:
   - Set `active: false`
   - Record `cancelledAt` timestamp
   - Set `stoppedReason: "user_cancel"`
3. Report how many modes were deactivated

### Implementation Note
The cancel logic is implemented in `keyword-detector.mjs` (hooks/scripts/keyword-detector.mjs). This SKILL.md documents the behavior for Claude's reference, but the actual enforcement happens at the hook level. The hook intercepts the "cancel" keyword before it reaches the agent and handles state file updates directly.

### Cancel Rules
- Cancel is immediate — no confirmation prompt needed (the user already said "cancel")
- Always confirm what was cancelled so the user knows the state
- If the requested mode is not active, inform the user (not an error, just informational)
- Cancel does not undo work — it only stops future enforcement of the mode's loop/gate

## Composition
- **Standalone** — not called by other skills
- **Cancels**: ralph, autopilot, ultrawork, and any future mode with state in `.ira/state/`
- **Implementation**: hooks/scripts/keyword-detector.mjs
