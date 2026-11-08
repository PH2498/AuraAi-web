import { originOf, providerMessage, readLines } from './http';
import type { ChatRequest, ModelProvider, ProviderEvent, ProviderHealth } from './provider';

export class OllamaAdapter implements ModelProvider {
  readonly id = 'ollama' as const;
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.baseUrl = originOf(baseUrl || 'http://127.0.0.1:11434');
  }

  async *stream(request: ChatRequest, signal: AbortSignal): AsyncIterable<ProviderEvent> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/x-ndjson' },
        body: JSON.stringify({ model: request.model, messages: request.messages, stream: true }),
        signal,
      });
    } catch (error) {
      yield networkEvent(error);
      return;
    }
    if (!response.ok || !response.body) {
      yield { type: 'error', code: 'PROVIDER_ERROR', message: providerMessage(response.status, await response.text()) };
      return;
    }
    for await (const line of readLines(response.body)) {
      let parsed: {
        message?: { content?: string };
        done?: boolean;
        error?: string;
        prompt_eval_count?: number;
        eval_count?: number;
      };
      try {
        parsed = JSON.parse(line) as typeof parsed;
      } catch {
        continue;
      }
      if (parsed.error) {
        yield { type: 'error', code: 'PROVIDER_ERROR', message: providerMessage(500, JSON.stringify({ error: parsed.error })) };
        return;
      }
      if (parsed.message?.content) yield { type: 'delta', text: parsed.message.content };
      if (parsed.done) {
        yield { type: 'usage', inputTokens: parsed.prompt_eval_count, outputTokens: parsed.eval_count };
        yield { type: 'done' };
        return;
      }
    }
    yield { type: 'done' };
  }

  async healthCheck(model: string | null, signal: AbortSignal): Promise<ProviderHealth> {
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/api/tags`, { signal, headers: { accept: 'application/json' } });
      if (!response.ok) return { ok: false, message: providerMessage(response.status, await response.text()) };
      const body = (await response.json()) as { models?: { name?: string }[] };
      const names = (body.models ?? []).map((item) => item.name).filter((name): name is string => Boolean(name));
      if (model && !names.some((name) => name === model || name.startsWith(`${model}:`))) {
        return { ok: false, message: `Ollama 已连通，但没有模型 ${model}`, models: names };
      }
      return { ok: true, message: names.length ? `已连通，可用 ${names.length} 个模型` : '已连通，还没有拉取模型', models: names };
    } catch {
      return { ok: false, message: '没有连上 Ollama。请确认本机服务已启动。' };
    }
  }
}

function networkEvent(error: unknown): ProviderEvent {
  if (isAbort(error)) return { type: 'error', code: 'CANCELLED', message: '已停止生成' };
  return { type: 'error', code: 'PROVIDER_UNAVAILABLE', message: '没有连上 Ollama。请确认本机服务已启动。' };
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}
