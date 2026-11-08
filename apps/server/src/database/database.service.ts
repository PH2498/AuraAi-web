import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';
import { ENV } from '../config/config.module';
import type { AppEnv } from '../config/env';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: Pool;
  readonly db: NodePgDatabase;

  constructor(@Inject(ENV) env: AppEnv) {
    this.pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: 5,
      connectionTimeoutMillis: 2_000,
    });
    this.pool.on('error', (error: NodeJS.ErrnoException) => {
      this.logger.error(`database pool error: ${error.code ?? 'UNKNOWN'}`);
    });
    this.db = drizzle(this.pool);
  }

  async ping(): Promise<boolean> {
    try {
      await this.db.execute(sql`select 1`);
      return true;
    } catch (error) {
      this.logger.error(`database ping failed: ${errorCode(error)}`);
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}

function errorCode(error: unknown): string {
  if (!error || typeof error !== 'object') return 'UNKNOWN';
  if ('code' in error && error.code) return String(error.code);
  if ('errors' in error && Array.isArray(error.errors)) {
    for (const item of error.errors) {
      const code = errorCode(item);
      if (code !== 'UNKNOWN') return code;
    }
  }
  if ('cause' in error) return errorCode(error.cause);
  return 'UNKNOWN';
}
