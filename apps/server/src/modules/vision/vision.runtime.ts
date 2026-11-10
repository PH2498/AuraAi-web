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

  async look(
    userId: string,
    request: { providerId?: string; provider?: string; model?: string },
    bytes: Buffer,
    prompt: string,
    signal: AbortSignal,
  ): Promise<VisionCall> {
    const config = await this.config(userId, request);
    if (!config) {
      const message = request.provider === 'openai' || request.providerId
        ? '这个云端接口还没有配置。这一帧没有发出去。'
        : '本机 Ollama 还没有配置。这一帧没有发出去。';
      throw new VisionUnavailable(message);
    }
    if (config.provider === 'openai') {
      if (!config.apiKey) throw new VisionUnavailable('这个云端接口还没有密钥。这一帧没有发出去。');
      const model = request.model || config.model;
      if (!model) throw new VisionUnavailable('这个云端接口还没有填写模型名。这一帧没有发出去。');
      const summary = await this.openAi({ ...config, model }, bytes, prompt, signal);
      return { provider: 'openai', model, summary };
    }
    const names = await this.tags(config.baseUrl, signal);
    const requested = request.model?.trim();
    const model = requested ? this.installedVision(names, requested) : pickVisionModel(names);
    if (!model) {
      throw new VisionUnavailable('本机还没有可以看图的模型。当前文字模型不会假装看过这一帧，画面也没有发给它。');
    }
    const summary = await this.ollama(config.baseUrl, model, bytes, prompt, signal);
    return { provider: 'ollama', model, summary };
  }

  private installedVision(names: string[], requested: string): string | null {
    if (!pickVisionModel([requested])) return null;
    return names.find((name) => name === requested || name.startsWith(`${requested}:`)) ?? null;
  }

  private async config(userId: string, request: { providerId?: string; provider?: string }) {
    const provider = request.provider === 'openai' ? 'openai' : 'ollama';
    const rows = await this.database.db
      .select()
      .from(providerConfigs)
      .where(and(eq(providerConfigs.userId, userId), eq(providerConfigs.enabled, true)));
    const row = request.providerId ? rows.find((item) => item.id === request.providerId) : rows.find((item) => item.provider === provider);
    if (!row || (row.provider !== 'ollama' && row.provider !== 'openai')) return null;
    const kind = row.provider === 'openai' ? 'openai' : 'ollama';
    return {
      provider: kind as 'ollama' | 'openai',
      model: row.defaultModel,
      baseUrl: originOf(row.baseUrl || (kind === 'openai' ? 'https://api.openai.com/v1' : 'http://127.0.0.1:11434')),
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

  private async openAi(config: { baseUrl: string; apiKey: string; model: string }, bytes: Buffer, prompt: string, signal: AbortSignal): Promise<string> {
    let response: Response;
    try {
      response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({
          model: config.model,
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
    } catch {
      throw new VisionUnavailable('没有连上这个接口。这一帧没有发出去。');
    }
    if (!response.ok) throw new VisionUnavailable(providerMessage(response.status, await response.text()));
    const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    return body.choices?.[0]?.message?.content?.trim() || '模型没有返回看得见的内容。';
  }
}

export class VisionUnavailable extends Error {}

export const DEFAULT_VISION_PROMPT = PROMPT;
