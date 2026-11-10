import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  WEB_PORT: z.coerce.number().int().positive().default(5173),
  API_PORT: z.coerce.number().int().positive().default(3000),
  API_BASE_URL: z.string().min(1).default('http://localhost:3000'),
  DATABASE_URL: z
    .string()
    .min(1)
    .refine((value) => value.startsWith('postgres://') || value.startsWith('postgresql://')),
  AUTH_SECRET: z.string().min(8),
  ENCRYPTION_KEY: z.string().min(32),
  CORS_ORIGINS: z.string().min(1),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('debug'),
  AI_DEFAULT_PROVIDER: z.string().optional().default(''),
  AI_DEFAULT_MODEL: z.string().optional().default(''),
  OPENAI_API_KEY: z.string().optional().default(''),
  GEMINI_API_KEY: z.string().optional().default(''),
  ANTHROPIC_API_KEY: z.string().optional().default(''),
  AURA_BOOTSTRAP_EMAIL: z.string().optional().default(''),
  AURA_BOOTSTRAP_PASSWORD: z.string().optional().default(''),
});

export type AppEnv = z.infer<typeof EnvSchema>;

export type ParseResult = { ok: true; env: AppEnv } | { ok: false; message: string };

export function parseEnv(source: Record<string, string | undefined>): ParseResult {
  const result = EnvSchema.safeParse(source);
  if (result.success) {
    return { ok: true, env: result.data };
  }

  const names = result.error.issues.map((issue) => issue.path.join('.') || '环境变量');
  return { ok: false, message: `配置无效，请检查: ${[...new Set(names)].join(', ')}` };
}

export function productionConfigError(env: AppEnv): string | null {
  if (env.NODE_ENV !== 'production') return null;
  const problems: string[] = [];
  if (env.AUTH_SECRET === 'replace-me' || env.AUTH_SECRET.length < 24) problems.push('AUTH_SECRET');
  if (env.ENCRYPTION_KEY.toLowerCase().includes('placeholder')) problems.push('ENCRYPTION_KEY');
  if (env.CORS_ORIGINS.split(',').some((item) => item.trim() === '*')) problems.push('CORS_ORIGINS');
  if (env.DATABASE_URL.includes('aura_dev')) problems.push('DATABASE_URL');
  if (!problems.length) return null;
  return `生产配置还不能上线，请更换: ${problems.join(', ')}`;
}
