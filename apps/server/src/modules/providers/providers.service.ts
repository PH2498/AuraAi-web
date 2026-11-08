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

const PROVIDERS = ['ollama', 'openai', 'anthropic', 'gemini'] as const;

const CreateSchema = z.object({
  provider: z.enum(PROVIDERS),
  displayName: z.string().trim().min(1).max(80),
  apiKey: z.string().max(500).optional(),
  baseUrl: z.union([z.string().trim().url().max(300), z.literal('')]).optional(),
  defaultModel: z.string().trim().max(80).optional(),
  enabled: z.boolean().optional(),
});

const UpdateSchema = z
  .object({
    displayName: z.string().trim().min(1).max(80).optional(),
    apiKey: z.string().max(500).nullable().optional(),
    baseUrl: z.union([z.string().trim().url().max(300), z.literal('')]).nullable().optional(),
    defaultModel: z.string().trim().max(80).nullable().optional(),
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
      if (isUnique(error)) fail(409, 'CONFLICT', '这个提供方已经配置过');
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
