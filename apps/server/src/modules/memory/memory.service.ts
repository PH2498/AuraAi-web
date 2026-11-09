import { Injectable } from '@nestjs/common';
import type { MemoryCategory, MemoryDto, MemorySourceType, MemoryStatus } from '@aura/shared-types';
import { and, desc, eq, ilike, or } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { fail } from '../../common/http';
import { DatabaseService } from '../../database/database.service';
import { memories } from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { MEMORY_CATEGORIES, MEMORY_SOURCES, initialStatus } from './memory.policy';

const CreateSchema = z.object({
  category: z.enum(MEMORY_CATEGORIES).default('pref'),
  title: z.string().trim().min(1).max(80).optional(),
  content: z.string().trim().min(1).max(2_000),
  sourceType: z.enum(MEMORY_SOURCES).default('manual'),
  pinned: z.boolean().default(false),
});

const UpdateSchema = z
  .object({
    category: z.enum(MEMORY_CATEGORIES).optional(),
    title: z.string().trim().min(1).max(80).optional(),
    content: z.string().trim().min(1).max(2_000).optional(),
    pinned: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), { message: '没有要更新的内容' });

type MemoryRow = typeof memories.$inferSelect;

@Injectable()
export class MemoryService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async list(userId: string, status?: MemoryStatus): Promise<MemoryDto[]> {
    const where = status ? and(eq(memories.userId, userId), eq(memories.status, status)) : eq(memories.userId, userId);
    const rows = await this.database.db.select().from(memories).where(where).orderBy(desc(memories.pinned), desc(memories.updatedAt));
    return rows.map(toDto);
  }

  async search(userId: string, query: string, status?: MemoryStatus): Promise<MemoryDto[]> {
    const needle = query.trim().slice(0, 80).replace(/[%_\\]/g, '');
    if (!needle) fail(400, 'VALIDATION_ERROR', '请输入要搜索的内容');
    const match = or(ilike(memories.content, `%${needle}%`), ilike(memories.title, `%${needle}%`));
    const where = status ? and(eq(memories.userId, userId), eq(memories.status, status), match) : and(eq(memories.userId, userId), match);
    const rows = await this.database.db.select().from(memories).where(where).orderBy(desc(memories.updatedAt)).limit(40);
    return rows.map(toDto);
  }

  async get(userId: string, id: string): Promise<MemoryDto> {
    return toDto(await this.owned(userId, id));
  }

  async create(userId: string, input: unknown): Promise<MemoryDto> {
    const parsed = CreateSchema.safeParse(input);
    if (!parsed.success) fail(400, 'VALIDATION_ERROR', '记忆内容无效');
    const content = parsed.data.content;
    const id = randomUUID();
    const status = initialStatus(parsed.data.sourceType);
    const now = new Date();
    await this.database.db.insert(memories).values({
      id,
      userId,
      category: parsed.data.category,
      title: parsed.data.title || content.slice(0, 40),
      content,
      sourceType: parsed.data.sourceType,
      status,
      pinned: parsed.data.pinned,
      createdAt: now,
      updatedAt: now,
    });
    await this.audit.record({ userId, action: 'memory.create', resourceType: 'memory', resourceId: id, metadata: { status, sourceType: parsed.data.sourceType } });
    return this.get(userId, id);
  }

  async update(userId: string, id: string, input: unknown): Promise<MemoryDto> {
    const parsed = UpdateSchema.safeParse(input);
    if (!parsed.success) fail(400, 'VALIDATION_ERROR', '记忆内容无效');
    await this.owned(userId, id);
    await this.database.db
      .update(memories)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(memories.id, id), eq(memories.userId, userId)));
    await this.audit.record({ userId, action: 'memory.update', resourceType: 'memory', resourceId: id, metadata: { fields: Object.keys(parsed.data) } });
    return this.get(userId, id);
  }

  async approve(userId: string, id: string): Promise<MemoryDto> {
    const row = await this.owned(userId, id);
    if (row.status === 'archived') fail(409, 'MEMORY_ARCHIVED', '这条记忆已经归档。');
    if (row.status !== 'active') {
      await this.database.db
        .update(memories)
        .set({ status: 'active', updatedAt: new Date() })
        .where(and(eq(memories.id, id), eq(memories.userId, userId)));
      await this.audit.record({ userId, action: 'memory.approve', resourceType: 'memory', resourceId: id, metadata: { status: 'active' } });
    }
    return this.get(userId, id);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.owned(userId, id);
    await this.database.db.delete(memories).where(and(eq(memories.id, id), eq(memories.userId, userId)));
    await this.audit.record({ userId, action: 'memory.delete', resourceType: 'memory', resourceId: id, metadata: { status: 'deleted' } });
  }

  private async owned(userId: string, id: string): Promise<MemoryRow> {
    if (!z.string().uuid().safeParse(id).success) fail(404, 'NOT_FOUND', '记忆不存在');
    const rows = await this.database.db
      .select()
      .from(memories)
      .where(and(eq(memories.id, id), eq(memories.userId, userId)))
      .limit(1);
    const row = rows[0];
    if (!row) fail(404, 'NOT_FOUND', '记忆不存在');
    return row;
  }
}

function toDto(row: MemoryRow): MemoryDto {
  return {
    id: row.id,
    category: row.category as MemoryCategory,
    title: row.title,
    content: row.content,
    sourceType: row.sourceType as MemorySourceType,
    status: row.status as MemoryStatus,
    pinned: row.pinned,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function activeMemoryLines(database: DatabaseService, userId: string): Promise<string> {
  const rows = await database.db
    .select({ content: memories.content, status: memories.status })
    .from(memories)
    .where(and(eq(memories.userId, userId), eq(memories.status, 'active')))
    .orderBy(desc(memories.pinned), desc(memories.updatedAt))
    .limit(12);
  if (!rows.length) return '';
  return `\n\n用户已经确认的记忆，只当作背景。待确认的记忆不在这里：\n${rows.map((item) => `- ${item.content}`).join('\n')}`;
}
