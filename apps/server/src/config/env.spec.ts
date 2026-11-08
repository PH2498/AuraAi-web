import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';

const valid = {
  NODE_ENV: 'development',
  WEB_PORT: '5173',
  API_PORT: '3000',
  API_BASE_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://aura:aura_dev@localhost:5432/aura',
  AUTH_SECRET: 'replace-me',
  ENCRYPTION_KEY: 'replace-with-32-byte-key-placeholder',
  CORS_ORIGINS: 'http://localhost:5173',
  LOG_LEVEL: 'debug',
};

describe('parseEnv', () => {
  it('accepts the development contract', () => {
    const result = parseEnv(valid);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.env.API_PORT).toBe(3000);
      expect(result.env.OPENAI_API_KEY).toBe('');
    }
  });

  it('names invalid keys and leaves secret values out of the message', () => {
    const result = parseEnv({
      ...valid,
      DATABASE_URL: undefined,
      AUTH_SECRET: 'super-secret-value',
      ENCRYPTION_KEY: 'short',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('DATABASE_URL');
      expect(result.message).toContain('ENCRYPTION_KEY');
      expect(result.message).not.toContain('super-secret-value');
      expect(result.message).not.toContain('short');
      expect(result.message).not.toContain('aura_dev');
    }
  });
});
