import { HttpException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadEnvFile } from '../config/env-file';
import { parseEnv, type AppEnv } from '../config/env';
import { DatabaseService } from '../database/database.service';
import { providerConfigs, users } from '../database/schema';
import { decryptSecret } from '../common/secrets';
import { AuditService } from './audit/audit.service';
import { AuthService } from './auth/auth.service';
import { ConversationsService } from './conversations/conversations.service';
import { ProvidersService } from './providers/providers.service';

loadEnvFile();
const parsed = parseEnv(process.env);
const env: AppEnv | null = parsed.ok ? parsed.env : null;

describe('phase 3 persistence', () => {
  const database = env ? new DatabaseService(env) : null;
  const audit = database ? new AuditService(database) : null;
  const auth = database && audit && env ? new AuthService(database, audit, env) : null;
  const conversations = database && audit ? new ConversationsService(database, audit) : null;
  const providers = database && audit && env ? new ProvidersService(database, audit, env) : null;
  const created: string[] = [];

  beforeAll(async () => {
    if (!database) throw new Error('测试需要有效的 DATABASE_URL');
    const ready = await database.ping();
    if (!ready) throw new Error('数据库未就绪，无法执行迁移后的集成测试');
  });

  afterAll(async () => {
    if (!database) return;
    for (const id of created) {
      await database.db.delete(users).where(eq(users.id, id));
    }
    await database.onModuleDestroy();
  });

  it('isolates conversations and persists messages for the owner only', async () => {
    if (!auth || !conversations) throw new Error('服务未就绪');
    const stamp = Date.now();
    const owner = await auth.createUser(`owner-${stamp}@phase3.test`, 'password-one');
    const other = await auth.createUser(`other-${stamp}@phase3.test`, 'password-two');
    created.push(owner.id, other.id);

    const conversation = await conversations.create(owner.id, { title: '只属于第一个用户' });
    const first = await conversations.addMessage(owner.id, conversation.id, { role: 'user', text: '你好' });
    const second = await conversations.addMessage(owner.id, conversation.id, {
      role: 'assistant',
      text: '这是保存下来的回复',
    });

    const history = await conversations.listMessages(owner.id, conversation.id);
    expect(history.map((item) => item.content.text)).toEqual(['你好', '这是保存下来的回复']);
    expect(first.sequence).toBe(1);
    expect(second.sequence).toBe(2);
    expect((await conversations.list(other.id)).some((item) => item.id === conversation.id)).toBe(false);
    await expect(conversations.get(other.id, conversation.id)).rejects.toMatchObject({ status: 404 });
  });

  it('encrypts a provider secret and keeps it out of the read API', async () => {
    if (!auth || !providers || !database || !env || !audit) throw new Error('服务未就绪');
    const stamp = Date.now();
    const owner = await auth.createUser(`keys-${stamp}@phase3.test`, 'password-one');
    const other = await auth.createUser(`keys-other-${stamp}@phase3.test`, 'password-two');
    created.push(owner.id, other.id);
    const secret = `sk-phase3-${stamp}`;

    const createdConfig = await providers.create(owner.id, {
      provider: 'openai',
      displayName: 'OpenAI',
      apiKey: secret,
    });
    const listed = await providers.list(owner.id);
    const serialized = JSON.stringify({ createdConfig, listed });
    expect(serialized).not.toContain(secret);
    expect(listed[0]?.keyConfigured).toBe(true);
    expect(listed[0]?.keyHint).toBe(secret.slice(-4));

    const [stored] = await database.db
      .select({ encryptedApiKey: providerConfigs.encryptedApiKey })
      .from(providerConfigs)
      .where(eq(providerConfigs.id, createdConfig.id));
    expect(stored?.encryptedApiKey).toBeTruthy();
    expect(stored?.encryptedApiKey).not.toContain(secret);
    expect(decryptSecret(stored?.encryptedApiKey ?? '', env.ENCRYPTION_KEY)).toBe(secret);
    expect(await providers.list(other.id)).toEqual([]);

    const logs = await audit.list(owner.id);
    expect(JSON.stringify(logs)).not.toContain(secret);
    expect(logs.some((item) => item.action === 'provider.create')).toBe(true);
  });

  it('rejects a wrong password without creating a session', async () => {
    if (!auth) throw new Error('服务未就绪');
    const stamp = Date.now();
    const user = await auth.createUser(`login-${stamp}@phase3.test`, 'password-one');
    created.push(user.id);
    const session = await auth.login({ email: user.email, password: 'password-one' });
    expect(session.token).not.toContain('password-one');
    expect((await auth.userFromToken(session.token))?.id).toBe(user.id);
    await expect(auth.login({ email: user.email, password: 'wrong-password' })).rejects.toBeInstanceOf(
      HttpException,
    );
  });
});
