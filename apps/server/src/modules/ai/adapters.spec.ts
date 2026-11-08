import { createServer, type Server } from 'node:http';
import { describe, expect, it } from 'vitest';
import { OllamaAdapter } from './ollama.adapter';
import { OpenAiAdapter } from './openai.adapter';

async function listen(handler: (body: string) => { status: number; type: string; body: string }): Promise<{ server: Server; url: string }> {
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const result = handler(Buffer.concat(chunks).toString('utf8'));
      response.writeHead(result.status, { 'content-type': result.type });
      response.end(result.body);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('测试服务没有地址');
  return { server, url: `http://127.0.0.1:${address.port}` };
}

describe('provider adapters', () => {
  it('turns an Ollama stream into text deltas and does not echo a secret', async () => {
    const secret = 'sk-should-not-appear';
    const { server, url } = await listen(() => ({
      status: 200,
      type: 'application/x-ndjson',
      body: `${JSON.stringify({ message: { content: '你' } })}\n${JSON.stringify({ message: { content: '好' }, done: true, prompt_eval_count: 3, eval_count: 2 })}\n`,
    }));
    try {
      const events = [];
      const adapter = new OllamaAdapter(url);
      for await (const event of adapter.stream(
        { model: 'qwen2.5:7b', messages: [{ role: 'user', content: secret }] },
        AbortSignal.timeout(5_000),
      )) {
        events.push(event);
      }
      const serialized = JSON.stringify(events);
      expect(serialized).toContain('你');
      expect(serialized).toContain('好');
      expect(serialized).not.toContain(secret);
      expect(events.some((event) => event.type === 'usage' && event.outputTokens === 2)).toBe(true);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('reads OpenAI deltas and keeps the bearer token out of errors', async () => {
    const { server, url } = await listen((body) => {
      expect(body).not.toContain('sk-test-value');
      return {
        status: 401,
        type: 'application/json',
        body: JSON.stringify({ error: { message: 'invalid key sk-test-value' } }),
      };
    });
    try {
      const adapter = new OpenAiAdapter(url, 'sk-test-value');
      const events = [];
      for await (const event of adapter.stream(
        { model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }] },
        AbortSignal.timeout(5_000),
      )) {
        events.push(event);
      }
      expect(JSON.stringify(events)).not.toContain('sk-test-value');
      expect(events[0]).toMatchObject({ type: 'error', code: 'PROVIDER_ERROR' });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
