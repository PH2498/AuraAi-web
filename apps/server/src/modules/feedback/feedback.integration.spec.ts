import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadEnvFile } from '../../config/env-file';
import { parseEnv, type AppEnv } from '../../config/env';
import { DatabaseService } from '../../database/database.service';
import { users } from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { FeedbackService } from './feedback.service';

loadEnvFile();
const parsed = parseEnv(process.env);
const env: AppEnv | null = parsed.ok ? parsed.env : null;

describe('phase 8 feedback', () => {
  const database = env ? new DatabaseService(env) : null;
  const audit = database ? new AuditService(database) : null;
  const auth = database && audit && env ? new AuthService(database, audit, env) : null;
  const feedback = database && audit ? new FeedbackService(database, audit) : null;
  const created: string[] = [];

  beforeAll(async () => {
    if (!database) throw new Error('测试需要有效的 DATABASE_URL');
    if (!(await database.ping())) throw new Error('数据库未就绪');
  });

  afterAll(async () => {
    if (!database) return;
    for (const id of created) await database.db.delete(users).where(eq(users.id, id));
    await database.onModuleDestroy();
  });

  it('keeps a note on the author and hides it from someone else', async () => {
    if (!auth || !feedback) throw new Error('服务未就绪');
    const author = await auth.createUser(`note-${Date.now()}@phase8.test`, 'password-one');
    const other = await auth.createUser(`other-${Date.now()}@phase8.test`, 'password-one');
    created.push(author.id, other.id);
    const saved = await feedback.create(author.id, { message: '发光体跟着声音走了' });
    expect(saved.message).toBe('发光体跟着声音走了');
    const own = await feedback.list(author.id);
    const foreign = await feedback.list(other.id);
    expect(own.some((item) => item.id === saved.id)).toBe(true);
    expect(foreign.some((item) => item.id === saved.id)).toBe(false);
    expect(JSON.stringify(own)).not.toContain('password-one');
  });
});
