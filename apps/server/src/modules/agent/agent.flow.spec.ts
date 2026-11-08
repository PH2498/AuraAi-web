import { HttpException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadEnvFile } from '../../config/env-file';
import { parseEnv, type AppEnv } from '../../config/env';
import { DatabaseService } from '../../database/database.service';
import { agentSteps, notes, users } from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { AgentService } from './agent.service';
import type { AgentPlanner, PlannedStep } from './planner';

loadEnvFile();
const parsed = parseEnv(process.env);
const env: AppEnv | null = parsed.ok ? parsed.env : null;

class ScriptPlanner implements AgentPlanner {
  constructor(private readonly plans: PlannedStep[][]) {}
  async plan(): Promise<PlannedStep[]> {
    return this.plans.shift() ?? [];
  }
  async summarize(): Promise<string> {
    return '已完成';
  }
}

describe('phase 5 agent', () => {
  const database = env ? new DatabaseService(env) : null;
  const audit = database ? new AuditService(database) : null;
  const auth = database && audit && env ? new AuthService(database, audit, env) : null;
  const plans: PlannedStep[][] = [];
  const agents = database && audit ? new AgentService(database, audit, { publish() {} }, new ScriptPlanner(plans)) : null;
  const created: string[] = [];

  beforeAll(async () => {
    if (!database) throw new Error('测试需要有效的 DATABASE_URL');
    if (!(await database.ping())) throw new Error('数据库未就绪');
  });

  afterAll(async () => {
    if (!database) return;
    for (const id of created) await database.db.delete(users).where(eq(users.id, id));
    await database.onModuleDestroy();
  });

  it('rejects an unregistered tool and does not run it', async () => {
    if (!auth || !agents || !database) throw new Error('服务未就绪');
    const owner = await auth.createUser(`agent-${Date.now()}@phase5.test`, 'password-one');
    created.push(owner.id);
    plans.push([{ tool: 'shell', input: { command: 'rm' } }]);
    const createdTask = await agents.create(owner.id, { goal: '执行命令' });
    const failed = await until(agents, owner.id, createdTask.id, 'failed');
    expect(failed.summary).toContain('不在白名单里');
    expect(await noteCount(database, owner.id)).toBe(0);
  });

  it('does not execute a medium-risk tool until it is approved, and refusal leaves it unexecuted', async () => {
    if (!auth || !agents || !database) throw new Error('服务未就绪');
    const owner = await auth.createUser(`agent-confirm-${Date.now()}@phase5.test`, 'password-one');
    created.push(owner.id);
    plans.push([
      { tool: 'get_current_time', input: {} },
      { tool: 'create_note', input: { title: '周报', body: '要点' } },
    ]);
    const createdTask = await agents.create(owner.id, { goal: '记下周报要点' });
    const waiting = await until(agents, owner.id, createdTask.id, 'waiting_confirmation');
    const noteStep = waiting.steps.find((step) => step.toolName === 'create_note');
    expect(waiting.steps.find((step) => step.toolName === 'get_current_time')?.status).toBe('completed');
    expect(noteStep?.confirmationStatus).toBe('pending');
    expect(await noteCount(database, owner.id)).toBe(0);
    const rejected = await agents.reject(owner.id, waiting.id, noteStep?.id ?? '');
    expect(rejected.status).toBe('rejected');
    expect(await noteCount(database, owner.id)).toBe(0);
  });

  it('runs the confirmed tool with the stored input and restores status from REST', async () => {
    if (!auth || !agents || !database) throw new Error('服务未就绪');
    const owner = await auth.createUser(`agent-ok-${Date.now()}@phase5.test`, 'password-one');
    const other = await auth.createUser(`agent-other-${Date.now()}@phase5.test`, 'password-one');
    created.push(owner.id, other.id);
    plans.push([{ tool: 'create_note', input: { title: '会议', body: '下周一' } }]);
    const createdTask = await agents.create(owner.id, { goal: '创建会议笔记' });
    const waiting = await until(agents, owner.id, createdTask.id, 'waiting_confirmation');
    const stepId = waiting.steps[0]?.id ?? '';
    const approved = await agents.approve(owner.id, waiting.id, stepId);
    const done = approved.status === 'completed' ? approved : await until(agents, owner.id, waiting.id, 'completed');
    expect(done.summary).toBe('已完成');
    const saved = await database.db.select().from(notes).where(eq(notes.userId, owner.id));
    expect(saved.map((item) => item.title)).toEqual(['会议']);
    await expect(agents.get(other.id, waiting.id)).rejects.toBeInstanceOf(HttpException);
    const restored = await agents.get(owner.id, waiting.id);
    expect(restored.status).toBe('completed');
  });

  it('refuses a confirmation after the stored input changes or it expires, and cancel stops the task', async () => {
    if (!auth || !agents || !database) throw new Error('服务未就绪');
    const owner = await auth.createUser(`agent-stop-${Date.now()}@phase5.test`, 'password-one');
    created.push(owner.id);
    plans.push([{ tool: 'create_note', input: { title: '原标题', body: '原文' } }]);
    const first = await agents.create(owner.id, { goal: '改参数' });
    const waiting = await until(agents, owner.id, first.id, 'waiting_confirmation');
    const stepId = waiting.steps[0]?.id ?? '';
    await database.db.update(agentSteps).set({ input: { title: '被替换', body: '原文' } }).where(eq(agentSteps.id, stepId));
    await expect(agents.approve(owner.id, first.id, stepId)).rejects.toMatchObject({ status: 409 });
    expect(await noteCount(database, owner.id)).toBe(0);

    plans.push([{ tool: 'create_note', input: { title: '过期', body: '原文' } }]);
    const second = await agents.create(owner.id, { goal: '过期确认' });
    const expiring = await until(agents, owner.id, second.id, 'waiting_confirmation');
    await database.db.update(agentSteps).set({ confirmExpiresAt: new Date(Date.now() - 1_000) }).where(eq(agentSteps.id, expiring.steps[0]?.id ?? ''));
    await expect(agents.approve(owner.id, second.id, expiring.steps[0]?.id ?? '')).rejects.toMatchObject({ status: 409 });
    expect((await agents.get(owner.id, second.id)).status).toBe('failed');

    plans.push([{ tool: 'create_note', input: { title: '取消', body: '原文' } }]);
    const third = await agents.create(owner.id, { goal: '取消任务' });
    const live = await until(agents, owner.id, third.id, 'waiting_confirmation');
    const cancelled = await agents.cancel(owner.id, live.id);
    expect(cancelled.status).toBe('cancelled');
    expect(await noteCount(database, owner.id)).toBe(0);
  });
});

async function until(agents: AgentService, userId: string, id: string, status: string) {
  const started = Date.now();
  let latest = '';
  while (Date.now() - started < 3_000) {
    const task = await agents.get(userId, id);
    latest = `${task.status} ${task.summary ?? ''}`;
    if (task.status === status) return task;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`任务停在 ${latest}，没有进入 ${status}`);
}

async function noteCount(database: DatabaseService, userId: string) {
  const rows = await database.db.select({ id: notes.id }).from(notes).where(eq(notes.userId, userId));
  return rows.length;
}
