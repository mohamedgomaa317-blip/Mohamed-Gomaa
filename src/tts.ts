import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

/**
 * Optional text-to-speech through whatever the OS already has.
 * Never a hard dependency: if nothing is found, `speak()` returns false.
 * Text is passed as an argument / env var — never through a shell.
 */
export interface TtsEngine {
  name: string;
  speak(text: string, slow?: boolean): boolean;
}

let cached: TtsEngine | null | undefined;
let enabled = true;

export function setTtsEnabled(on: boolean): void {
  enabled = on;
}

function has(cmd: string, args: string[] = ['--version']): boolean {
  const r = spawnSync(cmd, args, { stdio: 'ignore', timeout: 3000 });
  return !r.error;
}

function run(cmd: string, args: string[], env?: NodeJS.ProcessEnv): boolean {
  const r = spawnSync(cmd, args, {
    stdio: 'ignore',
    timeout: 30_000,
    env: env ? { ...process.env, ...env } : process.env,
  });
  return !r.error && r.status === 0;
}

export function detectTts(): TtsEngine | null {
  if (cached !== undefined) return cached;
  cached = null;
  if (process.platform === 'darwin' && existsSync('/usr/bin/say')) {
    cached = { name: 'say', speak: (t, slow) => run('say', ['-r', slow ? '140' : '185', t]) };
  } else if (process.platform === 'linux') {
    for (const cmd of ['espeak-ng', 'espeak']) {
      if (has(cmd)) {
        cached = { name: cmd, speak: (t, slow) => run(cmd, ['-v', 'en-us', '-s', slow ? '125' : '160', t]) };
        break;
      }
    }
  } else if (process.platform === 'win32' && has('powershell', ['-NoProfile', '-Command', 'exit 0'])) {
    cached = {
      name: 'SAPI',
      speak: (t, slow) =>
        run(
          'powershell',
          [
            '-NoProfile',
            '-Command',
            `$v = New-Object -ComObject SAPI.SpVoice; $v.Rate = ${slow ? -3 : 0}; [void]$v.Speak($env:ENG_TTS_TEXT)`,
          ],
          { ENG_TTS_TEXT: t },
        ),
    };
  }
  return cached;
}

export function ttsAvailable(): boolean {
  return enabled && detectTts() !== null;
}

export function speak(text: string, slow = false): boolean {
  if (!enabled) return false;
  const engine = detectTts();
  return engine ? engine.speak(text, slow) : false;
}
