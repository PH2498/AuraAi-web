import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, max } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { fail } from '../../common/http';
import { decryptSecret } from '../../common/secrets';
import { DatabaseService } from '../../database/database.service';
import { conversations, messages, providerConfigs } from '../../database/schema';
import { ENV } from '../../config/config.module';
import type { AppEnv } from '../../config/env';
import { AuditService } from '../audit/audit.service';
import { OllamaAdapter } from './ollama.adapter';
import { OpenAiAdapter } from './openai.adapter';
import type { ChatMessage, ModelProvider } from './provider';

const ChatSchema = z.object({
  conversationId: z.string().uuid().optional(),
  provider: z.enum(['ollama', 'openai']).optional(),
  model: z.string().trim().min(1).max(80).optional(),
  message: z.string().trim().min(1).max(20_000),
});

export type StreamWrite = (event: string, data: Record<string, unknown>) => void;

type Prepared = {
  userId: string;
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  provider: ModelProvider;
  model: string;
  messages: ChatMessage[];
  providerName: 'ollama' | 'openai';
};

const runs = new Map<string, AbortController>();

@Injectable()
export class AiService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: AppEnv,
  ) {}

  async prepare(userId: string, body: unknown): Promise<Prepared> {
    const parsed = ChatSchema.safeParse(body);
    if (!parsed.success) fail(400, 'VALIDATION_ERROR', '请求无效', { fields: ['message'] });
    const config = await this.resolveConfig(userId, parsed.data.provider);
    if (!config) {
      fail(409, 'PROVIDER_NOT_CONFIGURED', '提供方还没有配置。请先保存 Ollama 地址，或在服务器保存 OpenAI 密钥。');
    }
    if (config.provider === 'openai' && !config.apiKey) {
      fail(409, 'PROVIDER_NOT_CONFIGURED', 'OpenAI 密钥未配置。密钥只保存在服务器。');
    }
    const model = parsed.data.model || config.model;
    if (!model) fail(409, 'PROVIDER_NOT_CONFIGURED', '还没有选择模型。');

    const conversationId = parsed.data.conversationId ?? randomUUID();
    const created = !parsed.data.conversationId;
    if (created) {
      await this.database.db.insert(conversations).values({
        id: conversationId,
        userId,
        title: parsed.data.message.slice(0, 80),
        modelProvider: config.provider,
        modelName: model,
      });
    } else {
      const [owned] = await this.database.db
        .select({ id: conversations.id })
        .from(conversations)
        .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
        .limit(1);
      if (!owned) fail(404, 'NOT_FOUND', '未找到');
      await this.database.db
        .update(conversations)
        .set({ updatedAt: new Date(), modelProvider: config.provider, modelName: model })
        .where(eq(conversations.id, conversationId));
    }

    const history = await this.database.db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.sequence));
    const [current] = await this.database.db
      .select({ value: max(messages.sequence) })
      .from(messages)
      .where(eq(messages.conversationId, conversationId));
    let sequence = current?.value ?? 0;
    const userMessageId = randomUUID();
    const assistantMessageId = randomUUID();
    await this.database.db.insert(messages).values([
      {
        id: userMessageId,
        conversationId,
        role: 'user',
        content: { text: parsed.data.message },
        sequence: ++sequence,
        status: 'complete',
      },
      {
        id: assistantMessageId,
        conversationId,
        role: 'assistant',
        content: { text: '' },
        sequence: ++sequence,
        status: 'streaming',
      },
    ]);

    const prior: ChatMessage[] = [
      { role: 'system', content: '你是 AURA。用中文简洁回答。不要声称已经操作了用户的电脑、邮件或日历。' },
      ...history
        .filter((item) => item.status === 'complete' && (item.role === 'user' || item.role === 'assistant') && item.content.text)
        .map((item) => ({ role: item.role as 'user' | 'assistant', content: item.content.text })),
      { role: 'user', content: parsed.data.message },
    ];

    return {
      userId,
      conversationId,
      userMessageId,
      assistantMessageId,
      provider: this.adapter(config),
      model,
      messages: prior,
      providerName: config.provider,
    };
  }

  async stream(prepared: Prepared, clientSignal: AbortSignal, write: StreamWrite): Promise<void> {
    const timeout = AbortSignal.timeout(120_000);
    const signal = AbortSignal.any([clientSignal, timeout]);
    const run = new AbortController();
    const onAbort = () => run.abort(signal.reason);
    signal.addEventListener('abort', onAbort);
    runs.set(prepared.assistantMessageId, run);
    write('message_start', {
      messageId: prepared.assistantMessageId,
      conversationId: prepared.conversationId,
      userMessageId: prepared.userMessageId,
    });

    let text = '';
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;
    let failed: { code: string; message: string } | null = null;
    const started = Date.now();
    try {
      for await (const event of prepared.provider.stream({ model: prepared.model, messages: prepared.messages }, run.signal)) {
        if (event.type === 'delta') {
          text = (text + event.text).slice(0, 20_000);
          write('content_delta', { text: event.text });
        } else if (event.type === 'usage') {
          inputTokens = event.inputTokens;
          outputTokens = event.outputTokens;
          write('usage', { inputTokens, outputTokens });
        } else if (event.type === 'error') {
          if (event.code !== 'CANCELLED') failed = { code: event.code, message: event.message };
          break;
        } else if (event.type === 'done') {
          break;
        }
      }
    } catch (error) {
      failed = classify(error);
    } finally {
      signal.removeEventListener('abort', onAbort);
      runs.delete(prepared.assistantMessageId);
    }

    const stopReason = run.signal.aborted ? abortReason(run.signal) : null;
    if (stopReason === 'timeout') failed = { code: 'PROVIDER_TIMEOUT', message: '模型响应超时' };
    if (stopReason === 'cancelled') failed = null;
    const status = failed ? 'error' : stopReason === 'cancelled' ? 'stopped' : 'complete';
    const finishReason = status === 'complete' ? 'stop' : status === 'stopped' ? 'cancelled' : 'error';
    const stored = text || failed?.message || '';
    await this.database.db
      .update(messages)
      .set({
        content: { text: stored },
        status,
        tokenUsage: inputTokens || outputTokens ? { inputTokens, outputTokens } : null,
      })
      .where(eq(messages.id, prepared.assistantMessageId));
    await this.audit.record({
      userId: prepared.userId,
      action: 'chat.complete',
      resourceType: 'message',
      resourceId: prepared.assistantMessageId,
      metadata: {
        provider: prepared.providerName,
        model: prepared.model,
        status,
        durationMs: Date.now() - started,
        inputTokens: inputTokens ?? null,
        outputTokens: outputTokens ?? null,
      },
    });
    if (failed && status === 'error') {
      write('error', failed);
      return;
    }
    write('message_end', { messageId: prepared.assistantMessageId, finishReason });
  }

  cancel(userId: string, messageId: string): Promise<{ ok: true }> {
    return this.assertOwner(userId, messageId).then(() => {
      runs.get(messageId)?.abort();
      return { ok: true as const };
    });
  }

  private async assertOwner(userId: string, messageId: string) {
    const [row] = await this.database.db
      .select({ id: messages.id })
      .from(messages)
      .innerJoin(conversations, eq(conversations.id, messages.conversationId))
      .where(and(eq(messages.id, messageId), eq(conversations.userId, userId)))
      .limit(1);
    if (!row) fail(404, 'NOT_FOUND', '未找到');
  }

  private async resolveConfig(
    userId: string,
    requested?: 'ollama' | 'openai',
  ): Promise<{ provider: 'ollama' | 'openai'; model: string | null; baseUrl: string | null; apiKey: string } | null> {
    const rows = await this.database.db
      .select()
      .from(providerConfigs)
      .where(and(eq(providerConfigs.userId, userId), eq(providerConfigs.enabled, true)));
    const row = rows.find((item) => item.provider === requested) ?? (requested ? undefined : rows.find((item) => item.provider === 'ollama' || item.provider === 'openai'));
    if (!row || (row.provider !== 'ollama' && row.provider !== 'openai')) return null;
    const provider = row.provider === 'openai' ? 'openai' : 'ollama';
    return {
      provider,
      model: row.defaultModel,
      baseUrl: row.baseUrl,
      apiKey: row.encryptedApiKey ? decryptSecret(row.encryptedApiKey, this.env.ENCRYPTION_KEY) : '',
    };
  }

  private adapter(config: { provider: 'ollama' | 'openai'; baseUrl: string | null; apiKey: string }): ModelProvider {
    if (config.provider === 'openai') return new OpenAiAdapter(config.baseUrl || 'https://api.openai.com/v1', config.apiKey);
    return new OllamaAdapter(config.baseUrl || 'http://127.0.0.1:11434');
  }
}

function classify(error: unknown): { code: string; message: string } {
  if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
    return { code: 'CANCELLED', message: '已停止生成' };
  }
  return { code: 'PROVIDER_ERROR', message: '模型服务暂时不可用' };
}

function abortReason(signal: AbortSignal): 'timeout' | 'cancelled' {
  const reason = signal.reason;
  if (reason instanceof Error && reason.name === 'TimeoutError') return 'timeout';
  return 'cancelled';
}

