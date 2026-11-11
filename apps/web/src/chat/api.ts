export type Account = { id: string; email: string };

export type ServerConversation = {
  id: string;
  title: string;
  modelProvider: string | null;
  modelName: string | null;
  updatedAt: string;
};

export type MessageAttachment = { id?: string; name: string; type: 'image' | 'file'; mime?: string; previewUrl?: string };

export type ServerMessage = {
  id: string;
  role: string;
  content: { text: string; display?: string; attachments?: MessageAttachment[]; memories?: { id: string; content: string }[] };
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

export type ProviderConfig = {
  id: string;
  provider: string;
  displayName: string;
  baseUrl: string | null;
  defaultModel: string | null;
  enabled: boolean;
  keyConfigured: boolean;
  keyHint: string | null;
};

export async function listProviders(): Promise<ProviderConfig[]> {
  const response = await fetch('/api/v1/providers', { credentials: 'include' });
  if (response.status === 401) return [];
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<ProviderConfig[]>;
}

export async function updateCloudEndpoint(
  id: string,
  input: { displayName: string; baseUrl: string; defaultModel: string; apiKey?: string },
): Promise<void> {
  const response = await fetch(`/api/v1/providers/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await readError(response));
}

export async function createCloudEndpoint(input: { displayName: string; baseUrl: string; defaultModel: string; apiKey: string }): Promise<void> {
  const response = await fetch('/api/v1/providers', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ provider: 'openai', enabled: true, ...input }),
  });
  if (!response.ok) throw new Error(await readError(response));
}

export async function deleteProvider(id: string): Promise<void> {
  const response = await fetch(`/api/v1/providers/${id}`, { method: 'DELETE', credentials: 'include' });
  if (!response.ok) throw new Error(await readError(response));
}

export async function testProvider(id: string): Promise<{ ok: boolean; message: string }> {
  const response = await fetch(`/api/v1/providers/${id}/test`, { method: 'POST', credentials: 'include' });
  const body = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
  if (!response.ok) throw new Error(body?.message || '连接测试没有完成');
  return { ok: Boolean(body?.ok), message: body?.message || '连接测试没有完成' };
}

export async function refreshOllama(baseUrl: string): Promise<{ ok: boolean; message: string; models: string[] }> {
  await ensureOllama(baseUrl);
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

export async function ensureOllama(baseUrl: string, model?: string): Promise<void> {
  const response = await fetch('/api/v1/providers', { credentials: 'include' });
  if (!response.ok) throw new Error(await readError(response));
  const rows = (await response.json()) as { id: string; provider: string; baseUrl: string | null; defaultModel: string | null }[];
  const current = rows.find((item) => item.provider === 'ollama');
  if (!current) {
    const created = await fetch('/api/v1/providers', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'ollama', displayName: 'Ollama', baseUrl, ...(model ? { defaultModel: model } : {}), enabled: true }),
    });
    if (!created.ok) throw new Error(await readError(created));
    return;
  }
  const patch: { baseUrl?: string; defaultModel?: string } = {};
  if (current.baseUrl !== baseUrl) patch.baseUrl = baseUrl;
  if (model && current.defaultModel !== model) patch.defaultModel = model;
  if (!patch.baseUrl && !patch.defaultModel) return;
  const updated = await fetch(`/api/v1/providers/${current.id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
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

export async function uploadAttachment(blob: Blob, name: string): Promise<{ id: string; name: string; type: 'image' | 'file'; mime: string }> {
  const body = new FormData();
  body.set('file', blob, name || '附件');
  body.set('name', name);
  const response = await fetch('/api/v1/chat/attachments', { method: 'POST', credentials: 'include', body });
  const payload = (await response.json().catch(() => null)) as { id?: string; name?: string; type?: 'image' | 'file'; mime?: string; message?: string } | null;
  if (!response.ok || !payload?.id || !payload.type || !payload.mime) throw new Error(payload?.message || '这个附件没有附上');
  return { id: payload.id, name: payload.name || name, type: payload.type, mime: payload.mime };
}

export async function streamReply(
  input: {
    message: string;
    display?: string;
    conversationId?: string;
    provider: 'ollama' | 'openai';
    providerId?: string;
    model: string;
    images?: { id: string }[];
    attachments?: { id: string }[];
  },
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
