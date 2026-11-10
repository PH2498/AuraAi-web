export type FeedbackNote = { id: string; message: string; createdAt: string };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  const payload = (await response.json().catch(() => null)) as (T & { message?: string }) | null;
  if (!response.ok) throw new Error(payload?.message || '反馈没有送出');
  return payload as T;
}

export function listFeedback(): Promise<FeedbackNote[]> {
  return request('/api/v1/feedback');
}

export function sendFeedback(message: string): Promise<FeedbackNote> {
  return request('/api/v1/feedback', { method: 'POST', body: JSON.stringify({ message }) });
}
