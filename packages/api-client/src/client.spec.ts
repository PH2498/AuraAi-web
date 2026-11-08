import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiClientError } from './index';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ApiClient', () => {
  it('returns the health payload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(
          { status: 'ok', service: 'aura-server', time: '2026-11-08T00:00:00.000Z' },
          200,
          {
            'x-request-id': 'req-1',
          },
        ),
      ),
    );

    const health = await new ApiClient({ baseUrl: 'http://localhost:3000' }).health();
    expect(health.service).toBe('aura-server');
  });

  it('keeps the server error code and message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(
          {
            code: 'INTERNAL_ERROR',
            message: '数据库未就绪',
            requestId: 'req-2',
            details: { database: 'down' },
          },
          503,
        ),
      ),
    );

    const error = await new ApiClient({ baseUrl: '' }).ready().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({
      code: 'INTERNAL_ERROR',
      message: '数据库未就绪',
      requestId: 'req-2',
      status: 503,
    });
  });

  it('reports a timeout without calling it a caller abort', async () => {
    vi.stubGlobal('fetch', vi.fn(hangUntilAbort));
    const error = await new ApiClient({ baseUrl: 'http://localhost:3000', timeoutMs: 20 })
      .health()
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({ message: '请求超时' });
  });

  it('rethrows when the caller aborts', async () => {
    vi.stubGlobal('fetch', vi.fn(hangUntilAbort));
    const controller = new AbortController();
    const pending = new ApiClient({ baseUrl: 'http://localhost:3000', timeoutMs: 5_000 }).health(
      controller.signal,
    );
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});

function hangUntilAbort(_url: string, init?: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    const abort = () => reject(new DOMException('aborted', 'AbortError'));
    if (init?.signal?.aborted) {
      abort();
      return;
    }
    init?.signal?.addEventListener('abort', abort, { once: true });
  });
}

function jsonResponse(body: unknown, status: number, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...(headers ?? {}) },
  });
}
