import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CANDIDATES = [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')];

export function loadEnvFile(): void {
  for (const path of CANDIDATES) {
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const separator = trimmed.indexOf('=');
      if (separator <= 0) continue;
      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim();
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
    return;
  }
}
