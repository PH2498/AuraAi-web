export interface ChatImage {
  mime: 'image/jpeg' | 'image/png' | 'image/webp';
  base64: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  images?: ChatImage[];
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
}

export type ProviderEvent =
  | { type: 'delta'; text: string }
  | { type: 'usage'; inputTokens?: number; outputTokens?: number }
  | { type: 'done' }
  | { type: 'error'; code: string; message: string };

export interface ProviderHealth {
  ok: boolean;
  message: string;
  models?: string[];
}

export interface ModelProvider {
  readonly id: 'ollama' | 'openai';
  stream(request: ChatRequest, signal: AbortSignal): AsyncIterable<ProviderEvent>;
  healthCheck(model: string | null, signal: AbortSignal): Promise<ProviderHealth>;
}
