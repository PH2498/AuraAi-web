import type { MemoryCategory, MemorySourceType, MemoryStatus } from '@aura/shared-types';

export const MEMORY_CATEGORIES = ['pref', 'profile', 'learned'] as const;
export const MEMORY_SOURCES = ['manual', 'conversation', 'agent'] as const;

export function initialStatus(source: MemorySourceType): MemoryStatus {
  return source === 'manual' ? 'active' : 'pending';
}

export function memoryContext(items: { content: string; status: MemoryStatus }[]): string {
  const active = items.filter((item) => item.status === 'active');
  if (!active.length) return '';
  return `\n\n用户已经确认的记忆，只当作背景。待确认的记忆不在这里：\n${active.map((item) => `- ${item.content}`).join('\n')}`;
}

export function isCategory(value: string): value is MemoryCategory {
  return (MEMORY_CATEGORIES as readonly string[]).includes(value);
}
