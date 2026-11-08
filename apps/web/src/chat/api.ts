export type Account = { id: string; email: string };

export type ServerConversation = {
  id: string;
  title: string;
  modelProvider: string | null;
  modelName: string | null;
  updatedAt: string;
};

export type ServerMessage = {
  id: string;
  role: string;
  content: { text: string };
  sequence: number;
  status: string;
};

export type ChatStream =
  | { type: 'message_start'; messageId: string; conversationId: string; userMessageId: string }
  | { type: 'content_delta'; text: string }
  | { type: 'usage'; inputTokens?: number; outputTokens?: number }
  | { type: 'message_end'; messageId: string; finishReason?: string }
  | { type: 'error'; code: string; message: string };

async function readError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { message?: string } | null;
  return body?.message || '请求没有完成';
}

export async function currentAccount(): Promise<Account | null> {
  const response = await fetch('/api/v1/auth/me', { credentials: 'include' });
  if (response.status === 401) return null;
  if (!response.ok) return null;
  const body = (await response.json()) as { user?: Account };
  return body.user ?? null;
}

export async function logoutAccount(): Promise<void> {
  await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' });
}

export async function renameConversation(id: string, title: string): Promise<void> {
  const response = await fetch(`/api/v1/conversations/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!response.ok) throw new Error(await readError(response));
}

export async function deleteConversation(id: string): Promise<void> {
  const response = await fetch(`/api/v1/conversations/${id}`, { method: 'DELETE', credentials: 'include' });
  if (!response.ok) throw new Error(await readError(response));
}

export async function listProviders(): Promise<{ id: string; provider: string; keyConfigured: boolean; keyHint: string | null }[]> {
  const response = await fetch('/api/v1/providers', { credentials: 'include' });
  if (response.status === 401) return [];
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<{ id: string; provider: string; keyConfigured: boolean; keyHint: string | null }[]>;
}

export async function saveOpenAiKey(apiKey: string): Promise<void> {
  const rows = await listProviders();
  const current = rows.find((item) => item.provider === 'openai');
  const payload = current
    ? { apiKey, defaultModel: 'gpt-4o' }
    : { provider: 'openai', displayName: 'OpenAI', apiKey, defaultModel: 'gpt-4o', baseUrl: 'https://api.openai.com/v1' };
  const response = await fetch(current ? `/api/v1/providers/${current.id}` : '/api/v1/providers', {
    method: current ? 'PATCH' : 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await readError(response));
}

export async function refreshOllama(baseUrl: string, model: string): Promise<{ ok: boolean; message: string; models: string[] }> {
  await ensureOllama(baseUrl, model);
  const listed = await fetch('/api/v1/providers', { credentials: 'include' });
  if (!listed.ok) throw new Error(await readError(listed));
  const rows = (await listed.json()) as { id: string; provider: string }[];
  const current = rows.find((item) => item.provider === 'ollama');
  if (!current) return { ok: false, message: 'Ollama 还没有配置', models: [] };
  const tested = await fetch(`/api/v1/providers/${current.id}/test`, { method: 'POST', credentials: 'include' });
  const body = (await tested.json().catch(() => null)) as { ok?: boolean; message?: string; models?: string[] } | null;
  if (!tested.ok) throw new Error(body?.message || '连接测试没有完成');
  return { ok: Boolean(body?.ok), message: body?.message || '连接测试没有完成', models: body?.models ?? [] };
}

export async function loginAccount(email: string, password: string): Promise<Account> {
  const response = await fetch('/api/v1/auth/login', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as { user: Account };
  return body.user;
}

export async function ensureOllama(baseUrl: string, model: string): Promise<void> {
  const response = await fetch('/api/v1/providers', { credentials: 'include' });
  if (!response.ok) throw new Error(await readError(response));
  const rows = (await response.json()) as { id: string; provider: string; baseUrl: string | null; defaultModel: string | null }[];
  const current = rows.find((item) => item.provider === 'ollama');
  if (!current) {
    const created = await fetch('/api/v1/providers', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'ollama', displayName: 'Ollama', baseUrl, defaultModel: model, enabled: true }),
    });
    if (!created.ok) throw new Error(await readError(created));
    return;
  }
  if (current.baseUrl === baseUrl && current.defaultModel === model) return;
  const updated = await fetch(`/api/v1/providers/${current.id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ baseUrl, defaultModel: model }),
  });
  if (!updated.ok) throw new Error(await readError(updated));
}

export async function listConversations(): Promise<ServerConversation[]> {
  const response = await fetch('/api/v1/conversations', { credentials: 'include' });
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<ServerConversation[]>;
}

export async function listMessages(conversationId: string): Promise<ServerMessage[]> {
  const response = await fetch(`/api/v1/conversations/${conversationId}/messages`, { credentials: 'include' });
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<ServerMessage[]>;
}

export async function streamReply(
  input: { message: string; conversationId?: string; provider: 'ollama' | 'openai'; model: string },
  handlers: {
    signal: AbortSignal;
    onStart: (event: Extract<ChatStream, { type: 'message_start' }>) => void;
    onDelta: (text: string) => void;
  },
): Promise<void> {
  const response = await fetch('/api/v1/chat/completions', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify(input),
    signal: handlers.signal,
  });
  const type = response.headers.get('content-type') ?? '';
  if (!response.ok || !type.includes('text/event-stream') || !response.body) {
    throw new Error(await readError(response));
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (!handlers.signal.aborted) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() ?? '';
    for (const chunk of chunks) {
      const event = parseEvent(chunk);
      if (!event) continue;
      if (event.type === 'message_start') handlers.onStart(event);
      if (event.type === 'content_delta') handlers.onDelta(event.text);
      if (event.type === 'error') throw new Error(event.message);
    }
  }
}

function parseEvent(chunk: string): ChatStream | null {
  let name = '';
  let data = '';
  for (const line of chunk.split('\n')) {
    if (line.startsWith('event:')) name = line.slice(6).trim();
    if (line.startsWith('data:')) data += line.slice(5).trim();
  }
  if (!name || !data) return null;
  const parsed = JSON.parse(data) as Record<string, unknown>;
  if (name === 'message_start') {
    return {
      type: 'message_start',
      messageId: String(parsed.messageId),
      conversationId: String(parsed.conversationId),
      userMessageId: String(parsed.userMessageId),
    };
  }
  if (name === 'content_delta') return { type: 'content_delta', text: String(parsed.text ?? '') };
  if (name === 'error') return { type: 'error', code: String(parsed.code ?? ''), message: String(parsed.message ?? '模型服务暂时不可用') };
  if (name === 'message_end') return { type: 'message_end', messageId: String(parsed.messageId), finishReason: String(parsed.finishReason ?? '') };
  if (name === 'usage') return { type: 'usage' };
  return null;
}
