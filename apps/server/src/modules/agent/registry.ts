import { createHash } from 'node:crypto';
import { and, desc, eq, ilike } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { ToolRiskLevel } from '@aura/shared-types';
import type { DatabaseService } from '../../database/database.service';
import { conversations, notes } from '../../database/schema';

export type ToolContext = {
  userId: string;
  database: DatabaseService;
  signal: AbortSignal;
};

export type RegisteredTool = {
  name: string;
  description: string;
  riskLevel: ToolRiskLevel;
  requiresConfirmation: boolean;
  schema: z.ZodType<Record<string, unknown>>;
  run(input: Record<string, unknown>, context: ToolContext): Promise<Record<string, unknown>>;
};

const empty = z.object({}).strict();

const TOOLS: RegisteredTool[] = [
  {
    name: 'get_current_time',
    description: '读取服务器当前时间。',
    riskLevel: 'low',
    requiresConfirmation: false,
    schema: empty,
    async run() {
      const now = new Date();
      const text = now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
      return { summary: text, iso: now.toISOString(), timeZone: 'Asia/Shanghai' };
    },
  },
  {
    name: 'search_conversation',
    description: '在当前用户自己的会话标题里搜索。',
    riskLevel: 'low',
    requiresConfirmation: false,
    schema: z.object({ query: z.string().trim().min(1).max(80) }).strict(),
    async run(input, context) {
      const query = String(input.query).replace(/[%_\\]/g, '');
      const rows = await context.database.db
        .select({ id: conversations.id, title: conversations.title })
        .from(conversations)
        .where(and(eq(conversations.userId, context.userId), ilike(conversations.title, `%${query}%`)))
        .orderBy(desc(conversations.updatedAt))
        .limit(8);
      return {
        summary: rows.length ? `找到 ${rows.length} 条会话` : '没有匹配的会话',
        items: rows,
      };
    },
  },
  {
    name: 'list_memories',
    description: '读取当前用户已经确认的记忆。长期记忆尚未接入时返回空列表。',
    riskLevel: 'low',
    requiresConfirmation: false,
    schema: empty,
    async run() {
      return { summary: '长期记忆还没有接入，这次没有读取到记忆。', items: [], available: false };
    },
  },
  {
    name: 'create_note',
    description: '在 AURA 内部创建一条笔记。写入前需要用户确认。',
    riskLevel: 'medium',
    requiresConfirmation: true,
    schema: z.object({ title: z.string().trim().min(1).max(80), body: z.string().trim().min(1).max(2_000) }).strict(),
    async run(input, context) {
      const title = String(input.title);
      const body = String(input.body);
      const id = randomUUID();
      await context.database.db.insert(notes).values({ id, userId: context.userId, title, body });
      return { summary: `已创建笔记「${title}」`, id, title };
    },
  },
];

const BY_NAME = new Map(TOOLS.map((tool) => [tool.name, tool]));

export const MAX_STEPS = 4;
export const MAX_TOOL_RETRIES = 0;

export function listTools(): RegisteredTool[] {
  return TOOLS;
}

export function findTool(name: string): RegisteredTool | undefined {
  return BY_NAME.get(name);
}

export function needsConfirmation(tool: RegisteredTool): boolean {
  return tool.riskLevel === 'high' || tool.riskLevel === 'medium' || tool.requiresConfirmation;
}

export function toolTitle(name: string): string {
  if (name === 'get_current_time') return '读取当前时间';
  if (name === 'search_conversation') return '搜索会话';
  if (name === 'list_memories') return '读取记忆';
  if (name === 'create_note') return '创建笔记';
  return name;
}

export function inputHash(input: unknown): string {
  return createHash('sha256').update(stableString(input)).digest('base64url');
}

function stableString(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableString).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableString(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
