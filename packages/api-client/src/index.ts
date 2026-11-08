import type { ApiError, HealthReadyStatus, HealthStatus } from '@aura/shared-types';

export interface ApiClientOptions {
  baseUrl: string;
  timeoutMs?: number;
}

export class ApiClientError extends Error implements ApiError {
  readonly code: string;
  readonly requestId: string;
  readonly details?: Record<string, unknown>;
  readonly status: number;

  constructor(input: {
    code: string;
    message: string;
    requestId: string;
    status: number;
    details?: Record<string, unknown>;
  }) {
    super(input.message);
    this.name = 'ApiClientError';
    this.code = input.code;
    this.requestId = input.requestId;
    this.status = input.status;
    this.details = input.details;
  }
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  health(signal?: AbortSignal): Promise<HealthStatus> {
    return this.request<HealthStatus>('/api/v1/health', { signal });
  }

  ready(signal?: AbortSignal): Promise<HealthReadyStatus> {
    return this.request<HealthReadyStatus>('/api/v1/health/ready', { signal });
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const onCallerAbort = () => controller.abort();
    init?.signal?.addEventListener('abort', onCallerAbort);

    try {
      if (init?.signal?.aborted) {
        throw new DOMException('aborted', 'AbortError');
      }

      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          accept: 'application/json',
          ...(init?.headers ?? {}),
        },
      });
      const requestId = response.headers.get('x-request-id') ?? '';
      const text = await response.text();
      const body = text ? parseJson(text) : null;

      if (!response.ok) {
        throw toClientError(body, response.status, requestId);
      }

      if (body === null || typeof body !== 'object') {
        throw new ApiClientError({
          code: 'INTERNAL_ERROR',
          message: '服务返回了无法识别的内容',
          requestId,
          status: response.status,
        });
      }

      return body as T;
    } catch (error) {
      if (init?.signal?.aborted) {
        throw error instanceof DOMException ? error : new DOMException('aborted', 'AbortError');
      }
      if (controller.signal.aborted) {
        throw new ApiClientError({
          code: 'INTERNAL_ERROR',
          message: '请求超时',
          requestId: '',
          status: 0,
        });
      }
      if (error instanceof ApiClientError) {
        throw error;
      }
      throw new ApiClientError({
        code: 'INTERNAL_ERROR',
        message: '无法连接服务',
        requestId: '',
        status: 0,
      });
    } finally {
      clearTimeout(timer);
      init?.signal?.removeEventListener('abort', onCallerAbort);
    }
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function toClientError(body: unknown, status: number, requestId: string): ApiClientError {
  if (isApiError(body)) {
    return new ApiClientError({
      code: body.code,
      message: body.message,
      requestId: body.requestId || requestId,
      status,
      details: body.details,
    });
  }

  return new ApiClientError({
    code: 'INTERNAL_ERROR',
    message: '服务暂时不可用',
    requestId,
    status,
  });
}

function isApiError(body: unknown): body is ApiError {
  if (!body || typeof body !== 'object') return false;
  const record = body as Record<string, unknown>;
  return typeof record.code === 'string' && typeof record.message === 'string';
}
