import { loadEnvFile } from '../config/env-file';
import { parseEnv } from '../config/env';
import { isConnectionFailure, runMigrations } from './run-migrations';

async function main(): Promise<void> {
  loadEnvFile();
  const parsed = parseEnv(process.env);
  if (!parsed.ok) {
    console.error(parsed.message);
    process.exit(1);
  }

  try {
    await runMigrations(parsed.env.DATABASE_URL);
    console.log('迁移完成');
  } catch (error) {
    if (isConnectionFailure(error)) {
      console.error('数据库未就绪，无法执行迁移。请先启动 PostgreSQL（docker compose up -d）。');
    } else {
      console.error('迁移失败。请确认数据库已启动，且 DATABASE_URL 指向 aura 库。');
    }
    process.exitCode = 1;
  }
}

void main();
