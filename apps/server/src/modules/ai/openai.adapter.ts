import { originOf, providerMessage, readLines } from './http';
import type { ChatRequest, ModelProvider, ProviderEvent, ProviderHealth } from './provider';

export class OpenAiAdapter implements ModelProvider {
  readonly id = 'openai' as const;
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.baseUrl = originOf(baseUrl || 'https://api.openai.com/v1');
  }

  async *stream(request: ChatRequest, signal: AbortSignal): AsyncIterable<ProviderEvent> {
    if (!this.apiKey) {
      yield { type: 'error', code: 'PROVIDER_NOT_CONFIGURED', message: 'OpenAI 密钥未配置' };
      return;
    }
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'text/event-stream',
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ model: request.model, messages: request.messages, stream: true, stream_options: { include_usage: true } }),
        signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        yield { type: 'error', code: 'CANCELLED', message: '已停止生成' };
        return;
      }
      yield { type: 'error', code: 'PROVIDER_UNAVAILABLE', message: '没有连上 OpenAI' };
      return;
    }
    if (!response.ok || !response.body) {
      yield { type: 'error', code: 'PROVIDER_ERROR', message: providerMessage(response.status, await response.text()) };
      return;
    }
    for await (const line of readLines(response.body)) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') {
        yield { type: 'done' };
        return;
      }
      let parsed: {
        choices?: { delta?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
        error?: { message?: string };
      };
      try {
        parsed = JSON.parse(data) as typeof parsed;
      } catch {
        continue;
      }
      if (parsed.error?.message) {
        yield { type: 'error', code: 'PROVIDER_ERROR', message: providerMessage(500, JSON.stringify(parsed)) };
        return;
      }
      const text = parsed.choices?.[0]?.delta?.content;
      if (text) yield { type: 'delta', text };
      if (parsed.usage) {
        yield { type: 'usage', inputTokens: parsed.usage.prompt_tokens, outputTokens: parsed.usage.completion_tokens };
      }
    }
    yield { type: 'done' };
  }

  async healthCheck(model: string | null, signal: AbortSignal): Promise<ProviderHealth> {
    if (!this.apiKey) return { ok: false, message: 'OpenAI 密钥未配置' };
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/models${model ? `/${encodeURIComponent(model)}` : ''}`, {
        signal,
        headers: { accept: 'application/json', authorization: `Bearer ${this.apiKey}` },
      });
      if (!response.ok) return { ok: false, message: providerMessage(response.status, await response.text()) };
      return { ok: true, message: 'OpenAI 已连通' };
    } catch {
      return { ok: false, message: '没有连上 OpenAI' };
    }
  }
}
