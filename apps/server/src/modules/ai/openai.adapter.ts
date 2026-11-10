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
      yield { type: 'error', code: 'PROVIDER_NOT_CONFIGURED', message: '这个云端接口还没有密钥' };
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
      yield { type: 'error', code: 'PROVIDER_UNAVAILABLE', message: '没有连上这个接口' };
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
    if (!this.apiKey) return { ok: false, message: '这个云端接口还没有密钥' };
    try {
      const listed = await this.fetchImpl(`${this.baseUrl}/models`, {
        signal,
        headers: { accept: 'application/json', authorization: `Bearer ${this.apiKey}` },
      });
      const text = await listed.text();
      if (listed.ok) {
        const names = modelNames(text);
        if (model && names.length > 0 && !names.includes(model)) {
          return { ok: false, message: `接口已连通，但没有列出模型 ${model}` };
        }
        return { ok: true, message: names.length ? `接口已连通，列出 ${names.length} 个模型` : '接口已连通' };
      }
      if ((listed.status === 404 || listed.status === 405) && model) return this.probeChat(model, signal);
      return { ok: false, message: providerMessage(listed.status, text) };
    } catch {
      return { ok: false, message: '没有连上这个接口' };
    }
  }

  private async probeChat(model: string, signal: AbortSignal): Promise<ProviderHealth> {
    const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'hi' }], max_tokens: 1, stream: false }),
    });
    if (!response.ok) return { ok: false, message: providerMessage(response.status, await response.text()) };
    return { ok: true, message: '接口已连通' };
  }
}

function modelNames(text: string): string[] {
  try {
    const parsed = JSON.parse(text) as { data?: { id?: string }[]; models?: { id?: string }[] };
    return (parsed.data ?? parsed.models ?? []).map((item) => item.id).filter((id): id is string => Boolean(id));
  } catch {
    return [];
  }
}
