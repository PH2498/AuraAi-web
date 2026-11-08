import { HttpException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadEnvFile } from '../../config/env-file';
import { parseEnv, type AppEnv } from '../../config/env';
import { DatabaseService } from '../../database/database.service';
import { messages, users } from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { ProvidersService } from '../providers/providers.service';
import { AiService } from './ai.service';

loadEnvFile();
const parsed = parseEnv(process.env);
const env: AppEnv | null = parsed.ok ? parsed.env : null;

describe('phase 4 ollama chat', () => {
  const database = env ? new DatabaseService(env) : null;
  const audit = database ? new AuditService(database) : null;
  const auth = database && audit && env ? new AuthService(database, audit, env) : null;
  const providers = database && audit && env ? new ProvidersService(database, audit, env) : null;
  const ai = database && audit && env ? new AiService(database, audit, env) : null;
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

  it('rejects a chat when the user has no provider', async () => {
    if (!auth || !ai) throw new Error('服务未就绪');
    const user = await auth.createUser(`empty-${Date.now()}@phase4.test`, 'password-one');
    created.push(user.id);
    await expect(ai.prepare(user.id, { message: '你好', provider: 'ollama' })).rejects.toMatchObject({
      status: 409,
    });
  });

  it('streams a real local reply and keeps it after the request', async () => {
    if (!auth || !providers || !ai || !database) throw new Error('服务未就绪');
    const owner = await auth.createUser(`owner-${Date.now()}@phase4.test`, 'password-one');
    const other = await auth.createUser(`other-${Date.now()}@phase4.test`, 'password-one');
    created.push(owner.id, other.id);
    await providers.create(owner.id, {
      provider: 'ollama',
      displayName: 'Ollama',
      baseUrl: 'http://127.0.0.1:11434',
      defaultModel: 'qwen2.5:7b',
    });

    const prepared = await ai.prepare(owner.id, {
      provider: 'ollama',
      model: 'qwen2.5:7b',
      message: '只用一个汉字回答：好',
    });
    let reply = '';
    const events: string[] = [];
    await ai.stream(prepared, AbortSignal.timeout(90_000), (event, data) => {
      events.push(event);
      if (event === 'content_delta' && typeof data.text === 'string') reply += data.text;
    });

    expect(events[0]).toBe('message_start');
    expect(reply.trim().length).toBeGreaterThan(0);
    expect(events.at(-1)).toBe('message_end');
    expect(JSON.stringify(events)).not.toContain('sk-');

    const saved = await database.db
      .select({ content: messages.content, status: messages.status })
      .from(messages)
      .where(eq(messages.id, prepared.assistantMessageId));
    expect(saved[0]?.status).toBe('complete');
    expect(saved[0]?.content.text).toContain(reply.slice(0, 1));
    await expect(ai.prepare(other.id, { conversationId: prepared.conversationId, message: '偷看' })).rejects.toBeInstanceOf(
      HttpException,
    );
  }, 100_000);
});
