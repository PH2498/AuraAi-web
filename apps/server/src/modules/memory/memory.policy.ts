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

const MEMORY_STOP = new Set(['用户', '名字', '记住', '我的', '这个', '一个', '已经', '确认', '什么', '怎么', '可以', '没有', '不是', '我们', '自己', '因为', '所以', '如果', '还是', '就是']);

export function citedMemories<T extends { id: string; content: string }>(items: T[], transcript: string): T[] {
  const haystack = transcript.toLowerCase();
  if (!haystack.trim()) return [];
  return items.filter((item) => memoryMentioned(item.content, haystack));
}

function memoryMentioned(content: string, haystack: string): boolean {
  const raw = content.trim();
  if (!raw) return false;
  if (raw.length >= 4 && haystack.includes(raw.toLowerCase())) return true;
  const latin = raw.match(/[a-z0-9][a-z0-9._-]{2,}/gi) ?? [];
  if (latin.some((token) => haystack.includes(token.toLowerCase()))) return true;
  for (const run of raw.match(/[\u4e00-\u9fff]+/g) ?? []) {
    const sizes = run.length <= 6 ? [2, 3] : [3];
    for (const size of sizes) {
      if (run.length < size) continue;
      for (let index = 0; index <= run.length - size; index += 1) {
        const token = run.slice(index, index + size);
        if (MEMORY_STOP.has(token)) continue;
        if (haystack.includes(token)) return true;
      }
    }
  }
  return false;
}

export function isCategory(value: string): value is MemoryCategory {
  return (MEMORY_CATEGORIES as readonly string[]).includes(value);
}
