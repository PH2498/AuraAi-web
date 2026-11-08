import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { loadEnvFile } from '../src/config/env-file';
import { parseEnv } from '../src/config/env';

async function main(): Promise<void> {
  loadEnvFile();
  const parsed = parseEnv(process.env);
  if (!parsed.ok) {
    console.error(parsed.message);
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: parsed.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 2_000,
  });

  try {
    await migrate(drizzle(pool), { migrationsFolder: resolve(process.cwd(), 'drizzle') });
    console.log('迁移完成');
  } catch (error) {
    if (isConnectionFailure(error)) {
      console.error('数据库未就绪，无法执行迁移。请先启动 PostgreSQL（docker compose up -d）。');
    } else {
      console.error('迁移失败。请确认数据库已启动，且 DATABASE_URL 指向 aura 库。');
    }
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

function isConnectionFailure(error: unknown): boolean {
  const codes = new Set<string>();
  collect(error, codes);
  return ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'EAI_AGAIN', '57P01'].some((code) =>
    codes.has(code),
  );
}

function collect(error: unknown, codes: Set<string>): void {
  if (!error || typeof error !== 'object') return;
  if ('code' in error && (typeof error.code === 'string' || typeof error.code === 'number')) {
    codes.add(String(error.code));
  }
  if ('errors' in error && Array.isArray(error.errors)) {
    for (const nested of error.errors) collect(nested, codes);
  }
  if ('cause' in error) collect(error.cause, codes);
}

void main();
