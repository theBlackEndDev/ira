/**
 * Platform Adapter — the single seam that makes IRA run natively on macOS AND Linux.
 *
 * Every OS-specific touchpoint PAI hardcodes (launchctl/systemd, say/afplay/mpg123,
 * osascript/notify-send, open/xdg-open) is resolved HERE. No hook or service should call
 * an OS binary directly — they call this adapter, and it picks the right implementation.
 *
 * Runtime: node and Bun compatible builtins (runs under both `bun` and `node`).
 */
import { platform } from 'node:os';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';

export type OS = 'darwin' | 'linux';

/** Detect the host OS. Throws on anything we don't support (Windows is out of scope). */
export function detectOS(): OS {
  const p = platform();
  if (p === 'darwin') return 'darwin';
  if (p === 'linux') return 'linux';
  throw new Error(`[platform] unsupported OS: ${p} (IRA targets macOS + Linux)`);
}

/** True on a Linux box with no graphical/dbus session — voice + GUI notify must degrade. */
export function isHeadless(os: OS = detectOS()): boolean {
  if (os === 'darwin') return false;
  return !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY;
}

/** First binary on PATH from a candidate list, or null. */
function which(...cands: string[]): string | null {
  for (const c of cands) {
    const r = spawnSync('sh', ['-c', `command -v ${c}`], { encoding: 'utf8' });
    if (r.status === 0 && r.stdout.trim()) return c;
  }
  return null;
}

export interface ServiceSpec {
  name: string;            // e.g. "ira-pulse"  (no spaces)
  description: string;
  command: string;         // absolute path to the executable (e.g. bun)
  args?: string[];
  env?: Record<string, string>;
  workingDir?: string;
}

export interface RenderedUnit {
  kind: 'launchd' | 'systemd';
  path: string;            // where the unit file is written
  content: string;
  /** Post-install note (e.g. loginctl enable-linger for headless systemd). */
  note?: string;
}

export interface PlatformAdapter {
  os: OS;
  headless: boolean;
  /** Render (but do not install) the service unit for this OS. Pure — safe to call anywhere. */
  renderServiceUnit(spec: ServiceSpec): RenderedUnit;
  /** Write the unit + load it (launchctl load / systemctl --user enable --now). */
  installService(spec: ServiceSpec): RenderedUnit;
  uninstallService(name: string): void;
  /** Desktop notification — osascript (mac) / notify-send (linux GUI) / stderr log (headless). */
  notify(title: string, message: string): void;
  /** Speak text — `say` (mac) / espeak-ng if present (linux) / stderr log (headless/none). */
  speak(text: string): void;
  /** Play an audio file — afplay (mac) / mpg123|mpv|aplay (linux) / no-op log if none. */
  playAudio(file: string): void;
  /** Open a URL in the default browser — open (mac) / xdg-open (linux). */
  openUrl(url: string): void;
}

function launchdPlist(spec: ServiceSpec): string {
  const label = `com.ira.${spec.name}`;
  const progArgs = [spec.command, ...(spec.args ?? [])]
    .map((a) => `    <string>${a}</string>`).join('\n');
  const envBlock = spec.env
    ? `  <key>EnvironmentVariables</key>\n  <dict>\n` +
      Object.entries(spec.env).map(([k, v]) => `    <key>${k}</key>\n    <string>${v}</string>`).join('\n') +
      `\n  </dict>\n`
    : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  <key>ProgramArguments</key>
  <array>
${progArgs}
  </array>
${envBlock}  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>${spec.workingDir ? `\n  <key>WorkingDirectory</key>\n  <string>${spec.workingDir}</string>` : ''}
  <key>StandardErrorPath</key>
  <string>${join(homedir(), 'Library/Logs', `${label}.log`)}</string>
</dict>
</plist>
`;
}

function systemdUnit(spec: ServiceSpec): string {
  const execStart = [spec.command, ...(spec.args ?? [])].join(' ');
  const envLines = spec.env
    ? Object.entries(spec.env).map(([k, v]) => `Environment=${k}=${v}`).join('\n') + '\n'
    : '';
  return `[Unit]
Description=${spec.description}
After=network.target

[Service]
Type=simple
ExecStart=${execStart}
${spec.workingDir ? `WorkingDirectory=${spec.workingDir}\n` : ''}${envLines}Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
`;
}

export function getPlatformAdapter(forceOs?: OS): PlatformAdapter {
  const os = forceOs ?? detectOS();
  const headless = isHeadless(os);

  const renderServiceUnit = (spec: ServiceSpec): RenderedUnit => {
    if (os === 'darwin') {
      return {
        kind: 'launchd',
        path: join(homedir(), 'Library/LaunchAgents', `com.ira.${spec.name}.plist`),
        content: launchdPlist(spec),
      };
    }
    return {
      kind: 'systemd',
      path: join(homedir(), '.config/systemd/user', `${spec.name}.service`),
      content: systemdUnit(spec),
      note: 'Headless Linux: run `loginctl enable-linger $USER` so the user service survives logout.',
    };
  };

  return {
    os,
    headless,
    renderServiceUnit,
    installService(spec) {
      const u = renderServiceUnit(spec);
      mkdirSync(join(u.path, '..'), { recursive: true });
      writeFileSync(u.path, u.content);
      if (u.kind === 'launchd') {
        spawnSync('launchctl', ['unload', u.path], { stdio: 'ignore' });
        spawnSync('launchctl', ['load', u.path], { stdio: 'ignore' });
      } else {
        spawnSync('systemctl', ['--user', 'daemon-reload'], { stdio: 'ignore' });
        spawnSync('systemctl', ['--user', 'enable', '--now', `${spec.name}.service`], { stdio: 'ignore' });
      }
      return u;
    },
    uninstallService(name) {
      if (os === 'darwin') {
        const p = join(homedir(), 'Library/LaunchAgents', `com.ira.${name}.plist`);
        spawnSync('launchctl', ['unload', p], { stdio: 'ignore' });
        if (existsSync(p)) rmSync(p);
      } else {
        spawnSync('systemctl', ['--user', 'disable', '--now', `${name}.service`], { stdio: 'ignore' });
        const p = join(homedir(), '.config/systemd/user', `${name}.service`);
        if (existsSync(p)) rmSync(p);
      }
    },
    notify(title, message) {
      if (os === 'darwin') {
        spawnSync('osascript', ['-e', `display notification "${message}" with title "${title}"`], { stdio: 'ignore' });
        return;
      }
      if (!headless) {
        const ns = which('notify-send');
        if (ns) { spawnSync(ns, [title, message], { stdio: 'ignore' }); return; }
      }
      process.stderr.write(`[notify] ${title}: ${message}\n`);
    },
    speak(text) {
      if (os === 'darwin') { spawnSync('say', [text], { stdio: 'ignore' }); return; }
      const espeak = which('espeak-ng', 'espeak');
      if (espeak && !headless) { spawnSync(espeak, [text], { stdio: 'ignore' }); return; }
      process.stderr.write(`[speak] ${text}\n`);
    },
    playAudio(file) {
      if (os === 'darwin') { spawnSync('afplay', [file], { stdio: 'ignore' }); return; }
      const player = which('mpg123', 'mpv', 'ffplay', 'aplay');
      if (player) { spawn(player, [file], { stdio: 'ignore', detached: true }).unref(); return; }
      process.stderr.write(`[audio] (no player found) ${file}\n`);
    },
    openUrl(url) {
      const opener = os === 'darwin' ? 'open' : 'xdg-open';
      spawnSync(opener, [url], { stdio: 'ignore' });
    },
  };
}

// ── self-test CLI ───────────────────────────────────────────────────────────
// `bun platform.ts` (or `node`) prints detection + renders BOTH OS service units
// to prove cross-platform rendering works regardless of host.
const invokedDirectly = !!process.argv[1] && process.argv[1].includes('platform');
if (invokedDirectly) {
  const host = detectOS();
  console.log(`host OS:        ${host}`);
  console.log(`headless:       ${isHeadless(host)}`);
  const spec: ServiceSpec = {
    name: 'ira-pulse',
    description: 'IRA Pulse daemon',
    command: '/usr/local/bin/bun',
    args: ['run', 'pulse.ts'],
    env: { IRA_PORT: '31337' },
    workingDir: '/opt/ira',
  };
  for (const os of ['darwin', 'linux'] as OS[]) {
    const u = getPlatformAdapter(os).renderServiceUnit(spec);
    console.log(`\n--- ${os} → ${u.kind} @ ${u.path} ---`);
    console.log(u.content.split('\n').slice(0, 6).join('\n') + '\n...');
    if (u.note) console.log(`note: ${u.note}`);
  }
  console.log('\nself-test OK');
}
