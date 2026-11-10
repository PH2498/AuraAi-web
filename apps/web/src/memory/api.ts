import type { MemoryCategory, MemoryDto, MemorySourceType } from '@aura/shared-types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: 'include', ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
  const payload = (await response.json().catch(() => null)) as (T & { message?: string }) | null;
  if (!response.ok) throw new Error(payload?.message || '记忆没有完成');
  return payload as T;
}

export function listMemories(): Promise<MemoryDto[]> {
  return request('/api/v1/memories');
}

function changed<T>(result: Promise<T>): Promise<T> {
  return result.then((value) => {
    window.dispatchEvent(new Event('aura-memories'));
    return value;
  });
}

export function createMemory(input: { content: string; category?: MemoryCategory; sourceType?: MemorySourceType; pinned?: boolean; title?: string }): Promise<MemoryDto> {
  return changed(request('/api/v1/memories', { method: 'POST', body: JSON.stringify(input) }));
}

export function updateMemory(id: string, input: { content?: string; category?: MemoryCategory; pinned?: boolean; title?: string }): Promise<MemoryDto> {
  return changed(request(`/api/v1/memories/${id}`, { method: 'PATCH', body: JSON.stringify(input) }));
}

export function approveMemory(id: string): Promise<MemoryDto> {
  return changed(request(`/api/v1/memories/${id}/approve`, { method: 'POST', body: '{}' }));
}

export function deleteMemory(id: string): Promise<void> {
  return changed(request(`/api/v1/memories/${id}`, { method: 'DELETE' }));
}
