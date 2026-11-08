import type { AgentTaskDto } from '@aura/shared-types';

async function readError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { message?: string } | null;
  return body?.message || '请求没有完成';
}

export async function listTasks(): Promise<AgentTaskDto[]> {
  const response = await fetch('/api/v1/agents/tasks', { credentials: 'include' });
  if (response.status === 401) return [];
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<AgentTaskDto[]>;
}

export async function createTask(goal: string): Promise<AgentTaskDto> {
  const response = await fetch('/api/v1/agents/tasks', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ goal }),
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<AgentTaskDto>;
}

export async function cancelTask(id: string): Promise<AgentTaskDto> {
  const response = await fetch(`/api/v1/agents/tasks/${id}/cancel`, { method: 'POST', credentials: 'include' });
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<AgentTaskDto>;
}

export type AuditRow = {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export async function listAuditLogs(): Promise<AuditRow[]> {
  const response = await fetch('/api/v1/audit-logs', { credentials: 'include' });
  if (response.status === 401) return [];
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<AuditRow[]>;
}

export async function decideTask(taskId: string, stepId: string, decision: 'approve' | 'reject'): Promise<AgentTaskDto> {
  const response = await fetch(`/api/v1/agents/${taskId}/confirmations/${stepId}/${decision}`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<AgentTaskDto>;
}
