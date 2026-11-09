import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { ENV } from '../../config/config.module';
import type { AppEnv } from '../../config/env';
import { decryptSecret } from '../../common/secrets';
import { DatabaseService } from '../../database/database.service';
import { providerConfigs } from '../../database/schema';
import { originOf, providerMessage } from '../ai/http';
import { pickVisionModel } from './vision.policy';

const PROMPT = '请只根据这张图回答。用中文简洁说明看得见的内容。不要声称已经操作了用户的电脑、邮件或日历。';

export type VisionCall = {
  provider: 'ollama' | 'openai';
  model: string;
  summary: string;
};

@Injectable()
export class VisionRuntime {
  constructor(
    private readonly database: DatabaseService,
    @Inject(ENV) private readonly env: AppEnv,
  ) {}

  async look(userId: string, provider: 'ollama' | 'openai', bytes: Buffer, prompt: string, signal: AbortSignal): Promise<VisionCall> {
    const config = await this.config(userId, provider);
    if (!config) {
      const message = provider === 'openai' ? 'OpenAI 还没有配置密钥。这一帧没有发出去。' : '本机 Ollama 还没有配置。这一帧没有发出去。';
      throw new VisionUnavailable(message);
    }
    if (provider === 'openai') {
      if (!config.apiKey) throw new VisionUnavailable('OpenAI 密钥还没有保存。这一帧没有发出去。');
      const summary = await this.openAi(config, bytes, prompt, signal);
      return { provider, model: config.model || 'gpt-4o', summary };
    }
    const names = await this.tags(config.baseUrl, signal);
    const model = pickVisionModel(names);
    if (!model) {
      throw new VisionUnavailable('本机还没有可以看图的模型。当前文字模型不会假装看过这一帧，画面也没有发给它。');
    }
    const summary = await this.ollama(config.baseUrl, model, bytes, prompt, signal);
    return { provider, model, summary };
  }

  private async config(userId: string, provider: 'ollama' | 'openai') {
    const rows = await this.database.db
      .select()
      .from(providerConfigs)
      .where(and(eq(providerConfigs.userId, userId), eq(providerConfigs.enabled, true), eq(providerConfigs.provider, provider)));
    const row = rows[0];
    if (!row) return null;
    return {
      model: row.defaultModel,
      baseUrl: originOf(row.baseUrl || (provider === 'openai' ? 'https://api.openai.com/v1' : 'http://127.0.0.1:11434')),
      apiKey: row.encryptedApiKey ? decryptSecret(row.encryptedApiKey, this.env.ENCRYPTION_KEY) : '',
    };
  }

  private async tags(baseUrl: string, signal: AbortSignal): Promise<string[]> {
    const response = await this.fetchOrExplain(`${baseUrl}/api/tags`, { signal, headers: { accept: 'application/json' } });
    const body = (await response.json()) as { models?: { name?: string }[] };
    return (body.models ?? []).map((item) => item.name).filter((name): name is string => Boolean(name));
  }

  private async ollama(baseUrl: string, model: string, bytes: Buffer, prompt: string, signal: AbortSignal): Promise<string> {
    const response = await this.fetchOrExplain(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [{ role: 'user', content: prompt || PROMPT, images: [bytes.toString('base64')] }],
      }),
      signal,
    });
    const body = (await response.json()) as { message?: { content?: string } };
    return body.message?.content?.trim() || '模型没有返回看得见的内容。';
  }

  private async fetchOrExplain(url: string, init: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(url, init);
    } catch {
      throw new VisionUnavailable('没有连上 Ollama。这一帧没有发出去。');
    }
    if (!response.ok) throw new VisionUnavailable(providerMessage(response.status, await response.text()));
    return response;
  }

  private async openAi(config: { baseUrl: string; apiKey: string; model: string | null }, bytes: Buffer, prompt: string, signal: AbortSignal): Promise<string> {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model || 'gpt-4o',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt || PROMPT },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${bytes.toString('base64')}` } },
          ],
        }],
      }),
      signal,
    });
    if (!response.ok) throw new VisionUnavailable(providerMessage(response.status, await response.text()));
    const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    return body.choices?.[0]?.message?.content?.trim() || '模型没有返回看得见的内容。';
  }
}

export class VisionUnavailable extends Error {}

export const DEFAULT_VISION_PROMPT = PROMPT;
