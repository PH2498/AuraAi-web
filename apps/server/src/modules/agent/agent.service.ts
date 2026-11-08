import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { AgentEvent, AgentStepDto, AgentTaskDto, AgentTaskStatus, ConfirmationStatus, ToolRiskLevel } from '@aura/shared-types';
import { fail } from '../../common/http';
import { DatabaseService } from '../../database/database.service';
import { agentSteps, agentTasks } from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import type { AgentPlanner, PlannedStep } from './planner';
import { AgentEvents } from './agent.events';
import { findTool, inputHash, MAX_STEPS, needsConfirmation, toolTitle, type RegisteredTool } from './registry';

const CreateSchema = z.object({ goal: z.string().trim().min(1).max(2_000) });
const TERMINAL = new Set<AgentTaskStatus>(['completed', 'failed', 'cancelled', 'rejected']);
const CONFIRM_MS = 10 * 60 * 1000;

type TaskRow = typeof agentTasks.$inferSelect;
type StepRow = typeof agentSteps.$inferSelect;

export const AGENT_PLANNER = Symbol('AGENT_PLANNER');

@Injectable()
export class AgentService {
  private readonly runs = new Map<string, AbortController>();

  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    @Inject(AgentEvents) private readonly events: { publish(userId: string, event: AgentEvent): void },
    @Inject(AGENT_PLANNER) private readonly planner: AgentPlanner,
  ) {}

  async list(userId: string): Promise<AgentTaskDto[]> {
    const rows = await this.database.db
      .select()
      .from(agentTasks)
      .where(eq(agentTasks.userId, userId))
      .orderBy(desc(agentTasks.updatedAt));
    const tasks = [];
    for (const row of rows) tasks.push(await this.present(row));
    return tasks;
  }

  async get(userId: string, id: string): Promise<AgentTaskDto> {
    return this.present(await this.owned(userId, id));
  }

  async create(userId: string, body: unknown): Promise<AgentTaskDto> {
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) fail(400, 'VALIDATION_ERROR', '请写明要完成的事');
    const id = randomUUID();
    await this.database.db.insert(agentTasks).values({ id, userId, goal: parsed.data.goal, status: 'queued' });
    await this.audit.record({ userId, action: 'agent.task.create', resourceType: 'agent_task', resourceId: id, metadata: { status: 'queued' } });
    void this.advance(userId, id);
    return this.get(userId, id);
  }

  async cancel(userId: string, id: string): Promise<AgentTaskDto> {
    const row = await this.owned(userId, id);
    if (TERMINAL.has(row.status as AgentTaskStatus)) return this.present(row);
    this.runs.get(id)?.abort();
    await this.database.db
      .update(agentSteps)
      .set({ status: 'cancelled', completedAt: new Date() })
      .where(and(eq(agentSteps.taskId, id), inArray(agentSteps.status, ['pending', 'running', 'waiting_confirmation'])));
    await this.finishStatus(row, 'cancelled', '已取消。未执行的工具没有运行。');
    await this.audit.record({ userId, action: 'agent.task.cancel', resourceType: 'agent_task', resourceId: id, metadata: {} });
    return this.get(userId, id);
  }

  async approve(userId: string, taskId: string, stepId: string): Promise<AgentTaskDto> {
    const step = await this.pendingConfirmation(userId, taskId, stepId);
    if (step.confirmExpiresAt && step.confirmExpiresAt.getTime() <= Date.now()) {
      await this.database.db.update(agentSteps).set({ confirmationStatus: 'expired', status: 'failed', completedAt: new Date() }).where(eq(agentSteps.id, step.id));
      await this.finishStatus(await this.owned(userId, taskId), 'failed', '确认已过期，这次没有执行。');
      fail(409, 'CONFIRMATION_EXPIRED', '确认已过期，这次没有执行。');
    }
    if (inputHash(step.input ?? {}) !== step.inputHash) {
      fail(409, 'CONFIRMATION_MISMATCH', '确认时的参数已经变化，这次没有执行。');
    }
    const [locked] = await this.database.db
      .update(agentSteps)
      .set({ confirmationStatus: 'approved', status: 'pending' })
      .where(and(eq(agentSteps.id, step.id), eq(agentSteps.confirmationStatus, 'pending')))
      .returning();
    if (!locked) fail(409, 'CONFLICT', '这个确认已经处理过');
    await this.audit.record({ userId, action: 'agent.confirmation.approve', resourceType: 'agent_step', resourceId: step.id, metadata: { tool: step.toolName } });
    void this.advance(userId, taskId);
    return this.get(userId, taskId);
  }

  async reject(userId: string, taskId: string, stepId: string): Promise<AgentTaskDto> {
    const step = await this.pendingConfirmation(userId, taskId, stepId);
    const [locked] = await this.database.db
      .update(agentSteps)
      .set({ confirmationStatus: 'rejected', status: 'rejected', completedAt: new Date() })
      .where(and(eq(agentSteps.id, step.id), eq(agentSteps.confirmationStatus, 'pending')))
      .returning();
    if (!locked) fail(409, 'CONFLICT', '这个确认已经处理过');
    await this.database.db
      .update(agentSteps)
      .set({ status: 'cancelled', completedAt: new Date() })
      .where(and(eq(agentSteps.taskId, taskId), eq(agentSteps.status, 'pending')));
    await this.finishStatus(await this.owned(userId, taskId), 'rejected', '已拒绝。这个工具没有执行。');
    await this.audit.record({ userId, action: 'agent.confirmation.reject', resourceType: 'agent_step', resourceId: step.id, metadata: { tool: step.toolName } });
    return this.get(userId, taskId);
  }

  private async advance(userId: string, taskId: string): Promise<void> {
    if (this.runs.has(taskId)) return;
    const controller = new AbortController();
    this.runs.set(taskId, controller);
    try {
      let row = await this.owned(userId, taskId);
      if (TERMINAL.has(row.status as AgentTaskStatus)) return;
      if (row.status === 'queued') {
        row = await this.updateTask(row, { status: 'planning' });
        const plan = await this.planner.plan(userId, row.goal, controller.signal);
        this.assertPlan(plan);
        const latest = await this.owned(userId, taskId);
        if (TERMINAL.has(latest.status as AgentTaskStatus) || controller.signal.aborted) return;
        await this.insertSteps(latest.id, plan);
        row = await this.updateTask(latest, { status: 'running', plan });
      } else if (row.status === 'waiting_confirmation') {
        row = await this.updateTask(row, { status: 'running' });
      }
      await this.executePending(userId, row, controller.signal);
    } catch (error) {
      if (controller.signal.aborted) {
        const current = await this.owned(userId, taskId).catch(() => null);
        if (current && !TERMINAL.has(current.status as AgentTaskStatus)) {
          await this.finishStatus(current, 'cancelled', '已取消。未执行的工具没有运行。');
        }
        return;
      }
      const current = await this.owned(userId, taskId).catch(() => null);
      if (current && !TERMINAL.has(current.status as AgentTaskStatus)) {
        await this.finishStatus(current, 'failed', error instanceof Error ? error.message : '任务没有完成');
      }
    } finally {
      this.runs.delete(taskId);
    }
  }

  private assertPlan(plan: PlannedStep[]): void {
    if (plan.length > MAX_STEPS) throw new Error('一次任务最多 4 步。');
    for (const step of plan) {
      if (!findTool(step.tool)) throw new Error(`工具 ${step.tool} 不在白名单里，没有执行。`);
    }
  }

  private async insertSteps(taskId: string, plan: PlannedStep[]): Promise<void> {
    if (plan.length === 0) return;
    await this.database.db.insert(agentSteps).values(
      plan.map((step, index) => ({
        id: randomUUID(),
        taskId,
        sequence: index + 1,
        toolName: step.tool,
        title: toolTitle(step.tool),
        status: 'pending',
        riskLevel: findTool(step.tool)?.riskLevel ?? null,
        input: step.input,
      })),
    );
  }

  private async executePending(userId: string, task: TaskRow, signal: AbortSignal): Promise<void> {
    const steps = await this.stepsOf(task.id);
    const outputs: { tool: string; output: unknown }[] = [];
    for (const step of steps) {
      if (signal.aborted) throw new Error('已取消');
      const current = await this.owned(userId, task.id);
      if (TERMINAL.has(current.status as AgentTaskStatus)) return;
      if (step.status === 'completed' && step.result) outputs.push({ tool: step.toolName ?? '', output: step.result });
      if (step.status !== 'pending') continue;
      const tool = findTool(step.toolName ?? '');
      if (!tool) throw new Error(`工具 ${step.toolName ?? ''} 不在白名单里，没有执行。`);
      const parsed = tool.schema.safeParse(step.input ?? {});
      if (!parsed.success) {
        await this.database.db
          .update(agentSteps)
          .set({ status: 'failed', summary: '参数无效，没有执行', completedAt: new Date() })
          .where(eq(agentSteps.id, step.id));
        throw new Error(`${toolTitle(tool.name)} 的参数无效，没有执行。`);
      }
      const hash = inputHash(parsed.data);
      if (needsConfirmation(tool) && step.confirmationStatus !== 'approved') {
        const expires = new Date(Date.now() + CONFIRM_MS);
        const [waiting] = await this.database.db
          .update(agentSteps)
          .set({ status: 'waiting_confirmation', confirmationStatus: 'pending', input: parsed.data, inputHash: hash, confirmExpiresAt: expires, startedAt: new Date() })
          .where(eq(agentSteps.id, step.id))
          .returning();
        const current = await this.updateTask(task, { status: 'waiting_confirmation' });
        if (waiting) this.events.publish(userId, { type: 'confirmation.required', taskId: task.id, step: this.presentStep(waiting) });
        this.events.publish(userId, { type: 'task.updated', taskId: task.id, task: await this.present(current) });
        return;
      }
      await this.database.db.update(agentSteps).set({ input: parsed.data, inputHash: hash, status: 'running', startedAt: new Date() }).where(eq(agentSteps.id, step.id));
      const output = await this.runTool(userId, tool, parsed.data, signal);
      const [done] = await this.database.db
        .update(agentSteps)
        .set({ status: 'completed', confirmationStatus: step.confirmationStatus ?? 'not_required', result: output, summary: String(output.summary ?? '已完成'), completedAt: new Date() })
        .where(eq(agentSteps.id, step.id))
        .returning();
      if (done) this.events.publish(userId, { type: 'step.updated', taskId: task.id, step: this.presentStep(done) });
      outputs.push({ tool: tool.name, output });
      await this.audit.record({ userId, action: 'agent.tool.execute', resourceType: 'agent_step', resourceId: step.id, metadata: { tool: tool.name, ok: true } });
    }
    const summary = await this.planner.summarize(userId, task.goal, outputs, signal);
    await this.finishStatus(task, 'completed', summary);
  }

  private async runTool(userId: string, tool: RegisteredTool, input: Record<string, unknown>, signal: AbortSignal): Promise<Record<string, unknown>> {
    return tool.run(input, { userId, database: this.database, signal });
  }

  private async pendingConfirmation(userId: string, taskId: string, stepId: string): Promise<StepRow> {
    await this.owned(userId, taskId);
    const [step] = await this.database.db.select().from(agentSteps).where(and(eq(agentSteps.id, stepId), eq(agentSteps.taskId, taskId))).limit(1);
    if (!step || step.confirmationStatus !== 'pending') fail(404, 'NOT_FOUND', '没有待确认的步骤');
    return step;
  }

  private async owned(userId: string, id: string): Promise<TaskRow> {
    if (!z.string().uuid().safeParse(id).success) fail(404, 'NOT_FOUND', '未找到');
    const [row] = await this.database.db.select().from(agentTasks).where(and(eq(agentTasks.id, id), eq(agentTasks.userId, userId))).limit(1);
    if (!row) fail(404, 'NOT_FOUND', '未找到');
    return row;
  }

  private async stepsOf(taskId: string): Promise<StepRow[]> {
    return this.database.db.select().from(agentSteps).where(eq(agentSteps.taskId, taskId)).orderBy(asc(agentSteps.sequence));
  }

  private async updateTask(row: TaskRow, patch: Partial<typeof agentTasks.$inferInsert>): Promise<TaskRow> {
    const [next] = await this.database.db
      .update(agentTasks)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(agentTasks.id, row.id))
      .returning();
    return next ?? row;
  }

  private async finishStatus(row: TaskRow, status: AgentTaskStatus, summary: string): Promise<void> {
    const [next] = await this.database.db
      .update(agentTasks)
      .set({ status, summary, updatedAt: new Date(), finishedAt: new Date() })
      .where(eq(agentTasks.id, row.id))
      .returning();
    if (!next) return;
    const task = await this.present(next);
    const type = status === 'completed' ? 'task.completed' : status === 'failed' ? 'task.failed' : 'task.updated';
    this.events.publish(row.userId, { type, taskId: row.id, task });
    await this.audit.record({
      userId: row.userId,
      action: status === 'completed' ? 'agent.task.complete' : 'agent.task.finish',
      resourceType: 'agent_task',
      resourceId: row.id,
      metadata: { status },
    });
  }

  private async present(row: TaskRow): Promise<AgentTaskDto> {
    const steps = await this.stepsOf(row.id);
    return {
      id: row.id,
      goal: row.goal,
      status: row.status as AgentTaskStatus,
      summary: row.summary,
      steps: steps.map((step) => this.presentStep(step)),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private presentStep(step: StepRow): AgentStepDto {
    return {
      id: step.id,
      toolName: step.toolName,
      title: step.title,
      status: step.status,
      riskLevel: (step.riskLevel as ToolRiskLevel | null) ?? null,
      confirmationStatus: (step.confirmationStatus as ConfirmationStatus | null) ?? null,
      summary: step.summary,
      input: step.input,
      result: step.result,
      startedAt: step.startedAt?.toISOString() ?? null,
      completedAt: step.completedAt?.toISOString() ?? null,
    };
  }
}
