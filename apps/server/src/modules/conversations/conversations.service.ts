import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, max } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { fail } from '../../common/http';
import { DatabaseService } from '../../database/database.service';
import { conversations, messages } from '../../database/schema';
import { AuditService } from '../audit/audit.service';

const CreateSchema = z.object({
  title: z.string().trim().min(1).max(120),
  modelProvider: z.string().trim().max(40).optional(),
  modelName: z.string().trim().max(80).optional(),
});

const UpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    archived: z.boolean().optional(),
  })
  .refine((value) => value.title !== undefined || value.archived !== undefined, { message: 'empty' });

const MessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  text: z.string().trim().min(1).max(20_000),
});

@Injectable()
export class ConversationsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async list(userId: string) {
    const rows = await this.database.db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, userId))
      .orderBy(desc(conversations.updatedAt));
    return rows.map(presentConversation);
  }

  async create(userId: string, body: unknown) {
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) fail(400, 'VALIDATION_ERROR', '请求无效', { fields: ['title'] });
    const [row] = await this.database.db
      .insert(conversations)
      .values({
        id: randomUUID(),
        userId,
        title: parsed.data.title,
        modelProvider: parsed.data.modelProvider ?? null,
        modelName: parsed.data.modelName ?? null,
      })
      .returning();
    if (!row) fail(500, 'INTERNAL_ERROR', '服务暂时不可用');
    await this.audit.record({
      userId,
      action: 'conversation.create',
      resourceType: 'conversation',
      resourceId: row.id,
      metadata: { title: row.title },
    });
    return presentConversation(row);
  }

  async get(userId: string, id: string) {
    const row = await this.owned(userId, id);
    return presentConversation(row);
  }

  async update(userId: string, id: string, body: unknown) {
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) fail(400, 'VALIDATION_ERROR', '请求无效', { fields: ['title', 'archived'] });
    await this.owned(userId, id);
    const [row] = await this.database.db
      .update(conversations)
      .set({
        ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
        ...(parsed.data.archived !== undefined
          ? { archivedAt: parsed.data.archived ? new Date() : null }
          : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
      .returning();
    if (!row) fail(404, 'NOT_FOUND', '未找到');
    await this.audit.record({
      userId,
      action: 'conversation.update',
      resourceType: 'conversation',
      resourceId: row.id,
      metadata: { archived: parsed.data.archived ?? null },
    });
    return presentConversation(row);
  }

  async remove(userId: string, id: string) {
    await this.owned(userId, id);
    await this.database.db
      .delete(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.userId, userId)));
    await this.audit.record({
      userId,
      action: 'conversation.delete',
      resourceType: 'conversation',
      resourceId: id,
      metadata: {},
    });
    return { ok: true };
  }

  async listMessages(userId: string, conversationId: string) {
    await this.owned(userId, conversationId);
    const rows = await this.database.db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.sequence));
    return rows.map(presentMessage);
  }

  async addMessage(userId: string, conversationId: string, body: unknown) {
    const parsed = MessageSchema.safeParse(body);
    if (!parsed.success) fail(400, 'VALIDATION_ERROR', '请求无效', { fields: ['role', 'text'] });
    return this.database.db.transaction(async (tx) => {
      const [owned] = await tx
        .select({ id: conversations.id })
        .from(conversations)
        .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
        .limit(1);
      if (!owned) fail(404, 'NOT_FOUND', '未找到');
      const [current] = await tx
        .select({ value: max(messages.sequence) })
        .from(messages)
        .where(eq(messages.conversationId, conversationId));
      const [row] = await tx
        .insert(messages)
        .values({
          id: randomUUID(),
          conversationId,
          role: parsed.data.role,
          content: { text: parsed.data.text },
          sequence: (current?.value ?? 0) + 1,
          status: 'complete',
        })
        .returning();
      if (!row) fail(500, 'INTERNAL_ERROR', '服务暂时不可用');
      await tx
        .update(conversations)
        .set({ updatedAt: new Date() })
        .where(eq(conversations.id, conversationId));
      await this.audit.record({
        userId,
        action: 'message.create',
        resourceType: 'message',
        resourceId: row.id,
        metadata: { conversationId, role: row.role, sequence: row.sequence },
      });
      return presentMessage(row);
    });
  }

  private async owned(userId: string, id: string) {
    const [row] = await this.database.db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
      .limit(1);
    if (!row) fail(404, 'NOT_FOUND', '未找到');
    return row;
  }
}

function presentConversation(row: typeof conversations.$inferSelect) {
  return {
    id: row.id,
    title: row.title,
    modelProvider: row.modelProvider,
    modelName: row.modelName,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
  };
}

function presentMessage(row: typeof messages.$inferSelect) {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role,
    content: row.content,
    sequence: row.sequence,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}
