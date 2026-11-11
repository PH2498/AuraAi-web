import { HttpException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadEnvFile } from '../../config/env-file';
import { parseEnv, type AppEnv } from '../../config/env';
import { DatabaseService } from '../../database/database.service';
import { messages, users } from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { ConversationsService } from '../conversations/conversations.service';
import { ProvidersService } from '../providers/providers.service';
import { AiService } from './ai.service';
import { holdAttachment } from './frames';

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

  it('saves a document with the conversation and only the owner can read it', async () => {
    if (!auth || !providers || !ai || !database || !audit) throw new Error('服务未就绪');
    const owner = await auth.createUser(`files-${Date.now()}@phase4.test`, 'password-one');
    const other = await auth.createUser(`files-other-${Date.now()}@phase4.test`, 'password-one');
    created.push(owner.id, other.id);
    await providers.create(owner.id, {
      provider: 'ollama',
      displayName: 'Ollama',
      baseUrl: 'http://127.0.0.1:11434',
      defaultModel: 'qwen2.5:7b',
    });
    const note = holdAttachment(owner.id, Buffer.from('记得买牛奶'), 'text/plain; charset=utf-8', '笔记.txt', 'file');
    expect(note.ok).toBe(true);
    if (!note.ok) return;
    const prepared = await ai.prepare(owner.id, {
      provider: 'ollama',
      model: 'qwen2.5:7b',
      message: '看看这份笔记',
      display: '看看这份笔记',
      attachments: [{ id: note.id }],
    });
    const stored = await database.db
      .select({ content: messages.content })
      .from(messages)
      .where(eq(messages.id, prepared.userMessageId));
    expect(stored[0]?.content.attachments?.[0]).toMatchObject({ id: note.id, name: '笔记.txt', type: 'file' });
    expect(stored[0]?.content.text).toContain('记得买牛奶');
    expect((await ai.openAttachment(owner.id, note.id))?.bytes.toString()).toContain('记得买牛奶');
    expect(await ai.openAttachment(other.id, note.id)).toBeNull();
    await new ConversationsService(database, audit).remove(owner.id, prepared.conversationId);
    expect(await ai.openAttachment(owner.id, note.id)).toBeNull();
  });
});
