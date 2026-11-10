import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const extra = '/opt/homebrew/opt/postgresql@16/bin';
if (existsSync(extra)) process.env.PATH = `${extra}${process.env.PATH ? `:${process.env.PATH}` : ''}`;

function loadEnv() {
  for (const path of [resolve('.env'), resolve('apps/server/.env')]) {
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const separator = trimmed.indexOf('=');
      if (separator <= 0) continue;
      const key = trimmed.slice(0, separator).trim();
      if (process.env[key] === undefined) process.env[key] = trimmed.slice(separator + 1).trim();
    }
    return;
  }
}

loadEnv();
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('缺少 DATABASE_URL。');
  process.exit(1);
}

const dir = mkdtempSync(join(tmpdir(), 'aura-backup-'));
const file = join(dir, 'aura.dump');
const dump = spawnSync('pg_dump', ['--dbname', url, '--format=custom', '--no-owner', '--file', file], { stdio: ['ignore', 'inherit', 'inherit'] });
if (dump.error || dump.status !== 0) {
  rmSync(dir, { recursive: true, force: true });
  if (dump.error) console.error('找不到 pg_dump。请安装 PostgreSQL 16 客户端。');
  process.exit(dump.status ?? 1);
}
const listed = spawnSync('pg_restore', ['--list', file], { encoding: 'utf8' });
rmSync(dir, { recursive: true, force: true });
if (listed.status !== 0) process.exit(listed.status ?? 1);
if (!listed.stdout.includes('TABLE DATA public users') && !listed.stdout.includes('users')) {
  console.error('备份清单里没有 users。');
  process.exit(1);
}
if (!listed.stdout.includes('feedback')) {
  console.error('备份清单里没有 feedback。先执行迁移。');
  process.exit(1);
}
console.log('备份可以列出，包含 users 和 feedback。临时文件已删除。');
