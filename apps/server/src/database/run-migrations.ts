import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

export async function runMigrations(databaseUrl: string): Promise<void> {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    connectionTimeoutMillis: 2_000,
  });
  try {
    await migrate(drizzle(pool), { migrationsFolder: resolve(process.cwd(), 'drizzle') });
  } finally {
    await pool.end();
  }
}

export function isConnectionFailure(error: unknown): boolean {
  const codes = new Set<string>();
  collect(error, codes);
  return ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'EAI_AGAIN', '57P01'].some((code) => codes.has(code));
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
