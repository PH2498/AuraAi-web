import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { ENV } from '../../config/config.module';
import type { AppEnv } from '../../config/env';
import { decryptSecret } from '../../common/secrets';
import { DatabaseService } from '../../database/database.service';
import { providerConfigs } from '../../database/schema';
import { originOf, providerMessage } from '../ai/http';
import { listTools } from './registry';

export type PlannedStep = { tool: string; input: Record<string, unknown> };

export interface AgentPlanner {
  plan(userId: string, goal: string, signal: AbortSignal): Promise<PlannedStep[]>;
  summarize(userId: string, goal: string, results: { tool: string; output: unknown }[], signal: AbortSignal): Promise<string>;
}

const PlanSchema = z.object({
  steps: z
    .array(
      z.object({
        tool: z.string().trim().min(1).max(80),
        input: z.record(z.unknown()).optional(),
      }),
    )
    .max(4),
});

@Injectable()
export class ModelPlanner implements AgentPlanner {
  constructor(
    private readonly database: DatabaseService,
    @Inject(ENV) private readonly env: AppEnv,
  ) {}

  async plan(userId: string, goal: string, signal: AbortSignal): Promise<PlannedStep[]> {
    const catalog = listTools()
      .map((tool) => `${tool.name}：${tool.description} 风险 ${tool.riskLevel}。input 必须是 ${toolShape(tool.name)}`)
      .join('\n');
    const text = await this.complete(
      userId,
      [
        {
          role: 'system',
          content: `你是 AURA 的任务规划器。只输出 JSON：{"steps":[{"tool":"工具名","input":{}}]}。最多 4 步。只能使用这些工具：\n${catalog}\n不要发明字段或工具，不要请求 shell、文件或网页。创建笔记时 title 和 body 都要有内容。`,
        },
        { role: 'user', content: goal },
      ],
      signal,
      true,
    );
    return parsePlan(text);
  }

  async summarize(userId: string, goal: string, results: { tool: string; output: unknown }[], signal: AbortSignal): Promise<string> {
    const text = await this.complete(
      userId,
      [
        {
          role: 'system',
          content: '用一两句中文总结任务结果。只根据给出的工具结果说明已经发生的事。不要声称已经操作了用户的电脑、邮件或日历，也不要说可以在某个页面里查看或编辑。',
        },
        { role: 'user', content: JSON.stringify({ goal, results }).slice(0, 8_000) },
      ],
      signal,
      false,
    );
    const summary = text.replace(/\s+/g, ' ').trim();
    return summary.slice(0, 400) || '任务已完成。';
  }

  private async complete(userId: string, messages: { role: string; content: string }[], signal: AbortSignal, json: boolean): Promise<string> {
    const config = await this.config(userId);
    if (!config) throw new Error('还没有可用的模型。请接上本机 Ollama，或添加一个云端接口。');
    const timeout = AbortSignal.timeout(45_000);
    const combined = AbortSignal.any([signal, timeout]);
    if (config.provider === 'openai') {
      if (!config.apiKey) throw new Error('这个云端接口还没有密钥。密钥只保存在服务器。');
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({
          model: config.model,
          messages,
          stream: false,
          ...(json ? { response_format: { type: 'json_object' } } : {}),
        }),
        signal: combined,
      });
      if (!response.ok) throw new Error(providerMessage(response.status, await response.text()));
      const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
      return body.choices?.[0]?.message?.content ?? '';
    }
    const response = await fetch(`${config.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: config.model, messages, stream: false, ...(json ? { format: 'json' } : {}) }),
      signal: combined,
    });
    if (!response.ok) throw new Error(providerMessage(response.status, await response.text()));
    const body = (await response.json()) as { message?: { content?: string } };
    return body.message?.content ?? '';
  }

  private async config(userId: string) {
    const rows = await this.database.db
      .select()
      .from(providerConfigs)
      .where(and(eq(providerConfigs.userId, userId), eq(providerConfigs.enabled, true)));
    const row = rows.find((item) => item.provider === 'ollama') ?? rows.find((item) => item.provider === 'openai');
    if (!row || (row.provider !== 'ollama' && row.provider !== 'openai') || !row.defaultModel) return null;
    if (row.provider === 'openai') {
      return {
        provider: 'openai' as const,
        model: row.defaultModel,
        baseUrl: originOf(row.baseUrl || 'https://api.openai.com/v1'),
        apiKey: row.encryptedApiKey ? decryptSecret(row.encryptedApiKey, this.env.ENCRYPTION_KEY) : '',
      };
    }
    return {
      provider: 'ollama' as const,
      model: row.defaultModel,
      baseUrl: originOf(row.baseUrl || 'http://127.0.0.1:11434'),
      apiKey: '',
    };
  }
}

function toolShape(name: string): string {
  if (name === 'search_conversation') return '{"query":"关键词"}';
  if (name === 'create_note') return '{"title":"标题","body":"正文"}';
  return '{}';
}


export function parsePlan(text: string): PlannedStep[] {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('模型没有返回可执行的计划');
  let body: unknown;
  try {
    body = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error('模型没有返回可执行的计划');
  }
  const parsed = PlanSchema.safeParse(body);
  if (!parsed.success) throw new Error('一次任务最多 4 步，并且每一步都要写明工具名。');
  return parsed.data.steps.map((step) => ({ tool: step.tool, input: step.input ?? {} }));
}
