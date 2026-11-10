import { Injectable } from '@nestjs/common';
import { and, desc, eq, gt, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { fail } from '../../common/http';
import { DatabaseService } from '../../database/database.service';
import { feedback } from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { FEEDBACK_DAILY_LIMIT, normalizeFeedback } from './feedback.policy';

export type FeedbackNote = { id: string; message: string; createdAt: string };

@Injectable()
export class FeedbackService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async list(userId: string): Promise<FeedbackNote[]> {
    const rows = await this.database.db
      .select()
      .from(feedback)
      .where(eq(feedback.userId, userId))
      .orderBy(desc(feedback.createdAt))
      .limit(20);
    return rows.map((row) => ({ id: row.id, message: row.message, createdAt: row.createdAt.toISOString() }));
  }

  async create(userId: string, input: unknown): Promise<FeedbackNote> {
    const body = input && typeof input === 'object' ? (input as { message?: unknown }).message : undefined;
    const parsed = normalizeFeedback(body);
    if (!parsed.ok) fail(400, 'VALIDATION_ERROR', parsed.message);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [count] = await this.database.db
      .select({ total: sql<number>`count(*)::int` })
      .from(feedback)
      .where(and(eq(feedback.userId, userId), gt(feedback.createdAt, since)));
    if ((count?.total ?? 0) >= FEEDBACK_DAILY_LIMIT) fail(429, 'FEEDBACK_LIMIT', '今天的反馈已经够多了，明天再写。');
    const id = randomUUID();
    const [row] = await this.database.db
      .insert(feedback)
      .values({ id, userId, message: parsed.message })
      .returning();
    await this.audit.record({
      userId,
      action: 'feedback.create',
      resourceType: 'feedback',
      resourceId: id,
      metadata: { length: parsed.message.length },
    });
    return { id: row.id, message: row.message, createdAt: row.createdAt.toISOString() };
  }
}
