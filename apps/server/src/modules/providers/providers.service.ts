import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ENV } from '../../config/config.module';
import type { AppEnv } from '../../config/env';
import { fail } from '../../common/http';
import { encryptSecret, decryptSecret, keyHint } from '../../common/secrets';
import { DatabaseService } from '../../database/database.service';
import { providerConfigs } from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { OllamaAdapter } from '../ai/ollama.adapter';
import { OpenAiAdapter } from '../ai/openai.adapter';

const PROVIDERS = ['ollama', 'openai'] as const;

const CreateSchema = z.object({
  provider: z.enum(PROVIDERS),
  displayName: z.string().trim().min(1).max(80),
  apiKey: z.string().max(4000).optional(),
  baseUrl: z.union([z.string().trim().url().max(300), z.literal('')]).optional(),
  defaultModel: z.string().trim().max(200).optional(),
  enabled: z.boolean().optional(),
});

const UpdateSchema = z
  .object({
    displayName: z.string().trim().min(1).max(80).optional(),
    apiKey: z.string().max(4000).nullable().optional(),
    baseUrl: z.union([z.string().trim().url().max(300), z.literal('')]).nullable().optional(),
    defaultModel: z.string().trim().max(200).nullable().optional(),
    enabled: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.displayName !== undefined ||
      value.apiKey !== undefined ||
      value.baseUrl !== undefined ||
      value.defaultModel !== undefined ||
      value.enabled !== undefined,
    { message: 'empty' },
  );

type ProviderRow = typeof providerConfigs.$inferSelect;

@Injectable()
export class ProvidersService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: AppEnv,
  ) {}

  async list(userId: string) {
    const rows = await this.database.db
      .select()
      .from(providerConfigs)
      .where(eq(providerConfigs.userId, userId));
    return rows.map((row) => this.present(row));
  }

  async create(userId: string, body: unknown) {
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) fail(400, 'VALIDATION_ERROR', '请求无效', { fields: ['provider', 'displayName'] });
    if (parsed.data.provider === 'openai') {
      if (!parsed.data.baseUrl) fail(400, 'VALIDATION_ERROR', '云端接口需要填写地址。');
      if (!parsed.data.defaultModel) fail(400, 'VALIDATION_ERROR', '云端接口需要填写模型名。');
      if ((parsed.data.apiKey?.trim().length ?? 0) < 8) fail(400, 'VALIDATION_ERROR', '云端接口需要密钥。密钥只保存在服务器。');
    }
    if (parsed.data.provider === 'ollama') {
      const [existing] = await this.database.db
        .select({ id: providerConfigs.id })
        .from(providerConfigs)
        .where(and(eq(providerConfigs.userId, userId), eq(providerConfigs.provider, 'ollama')))
        .limit(1);
      if (existing) fail(409, 'CONFLICT', '本机 Ollama 已经配置过');
    }
    const secret = parsed.data.apiKey?.trim() ?? '';
    let row: ProviderRow | undefined;
    try {
      [row] = await this.database.db
        .insert(providerConfigs)
        .values({
          id: randomUUID(),
          userId,
          provider: parsed.data.provider,
          displayName: parsed.data.displayName,
          encryptedApiKey: secret ? encryptSecret(secret, this.env.ENCRYPTION_KEY) : null,
          baseUrl: parsed.data.baseUrl || null,
          defaultModel: parsed.data.defaultModel ?? null,
          enabled: parsed.data.enabled ?? true,
        })
        .returning();
    } catch (error) {
      if (isUnique(error)) fail(409, 'CONFLICT', '本机 Ollama 已经配置过');
      throw error;
    }
    if (!row) fail(500, 'INTERNAL_ERROR', '服务暂时不可用');
    await this.audit.record({
      userId,
      action: 'provider.create',
      resourceType: 'provider_config',
      resourceId: row.id,
      metadata: { provider: row.provider, keyConfigured: Boolean(secret) },
    });
    return this.present(row);
  }

  async update(userId: string, id: string, body: unknown) {
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) fail(400, 'VALIDATION_ERROR', '请求无效', { fields: ['displayName', 'apiKey'] });
    const current = await this.owned(userId, id);
    const secret = parsed.data.apiKey;
    const nextKey =
      secret === undefined
        ? current.encryptedApiKey
        : secret === null || secret.trim() === ''
          ? null
          : encryptSecret(secret.trim(), this.env.ENCRYPTION_KEY);
    const [row] = await this.database.db
      .update(providerConfigs)
      .set({
        ...(parsed.data.displayName !== undefined ? { displayName: parsed.data.displayName } : {}),
        ...(parsed.data.baseUrl !== undefined ? { baseUrl: parsed.data.baseUrl || null } : {}),
        ...(parsed.data.defaultModel !== undefined ? { defaultModel: parsed.data.defaultModel || null } : {}),
        ...(parsed.data.enabled !== undefined ? { enabled: parsed.data.enabled } : {}),
        encryptedApiKey: nextKey,
        updatedAt: new Date(),
      })
      .where(and(eq(providerConfigs.id, id), eq(providerConfigs.userId, userId)))
      .returning();
    if (!row) fail(404, 'NOT_FOUND', '未找到');
    await this.audit.record({
      userId,
      action: 'provider.update',
      resourceType: 'provider_config',
      resourceId: row.id,
      metadata: { provider: row.provider, keyChanged: secret !== undefined },
    });
    return this.present(row);
  }

  async remove(userId: string, id: string) {
    const current = await this.owned(userId, id);
    await this.database.db
      .delete(providerConfigs)
      .where(and(eq(providerConfigs.id, id), eq(providerConfigs.userId, userId)));
    await this.audit.record({
      userId,
      action: 'provider.delete',
      resourceType: 'provider_config',
      resourceId: id,
      metadata: { provider: current.provider },
    });
    return { ok: true };
  }

  async test(userId: string, id: string) {
    const row = await this.owned(userId, id);
    const signal = AbortSignal.timeout(8_000);
    const key = row.encryptedApiKey ? decryptSecret(row.encryptedApiKey, this.env.ENCRYPTION_KEY) : '';
    const health =
      row.provider === 'ollama'
        ? await new OllamaAdapter(row.baseUrl || 'http://127.0.0.1:11434').healthCheck(null, signal)
        : row.provider === 'openai'
          ? await new OpenAiAdapter(row.baseUrl || 'https://api.openai.com/v1', key).healthCheck(row.defaultModel, signal)
          : { ok: false, message: '这个接口还不能测试连接' };
    await this.audit.record({
      userId,
      action: 'provider.test',
      resourceType: 'provider_config',
      resourceId: row.id,
      metadata: { provider: row.provider, ok: health.ok },
    });
    return health;
  }

  private async owned(userId: string, id: string) {
    const [row] = await this.database.db
      .select()
      .from(providerConfigs)
      .where(and(eq(providerConfigs.id, id), eq(providerConfigs.userId, userId)))
      .limit(1);
    if (!row) fail(404, 'NOT_FOUND', '未找到');
    return row;
  }

  private present(row: ProviderRow) {
    const configured = Boolean(row.encryptedApiKey);
    return {
      id: row.id,
      provider: row.provider,
      displayName: row.displayName,
      baseUrl: row.baseUrl,
      defaultModel: row.defaultModel,
      enabled: row.enabled,
      keyConfigured: configured,
      keyHint: configured ? keyHint(decryptSecret(row.encryptedApiKey ?? '', this.env.ENCRYPTION_KEY)) : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

function isUnique(error: unknown): boolean {
  const codes = new Set<string>();
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    if ('code' in value && value.code) codes.add(String(value.code));
    if ('cause' in value) visit(value.cause);
  };
  visit(error);
  return codes.has('23505');
}
