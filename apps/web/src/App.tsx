import { useCallback, useEffect, useState } from 'react';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import { ApiClient, ApiClientError } from '@aura/api-client';
import type { HealthReadyStatus, HealthStatus } from '@aura/shared-types';
import { databaseLabel, serviceLabel } from './health';

const client = new ApiClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
});

type Slot<T> =
  { status: 'loading' } | { status: 'ok'; data: T } | { status: 'error'; message: string };

function HealthPage() {
  const [service, setService] = useState<Slot<HealthStatus>>({ status: 'loading' });
  const [database, setDatabase] = useState<Slot<HealthReadyStatus>>({ status: 'loading' });

  const load = useCallback((signal?: AbortSignal) => {
    setService({ status: 'loading' });
    setDatabase({ status: 'loading' });

    void client.health(signal).then(
      (data) => {
        if (!signal?.aborted) setService({ status: 'ok', data });
      },
      (error: unknown) => {
        if (signal?.aborted) return;
        setService({ status: 'error', message: messageOf(error) });
      },
    );

    void client.ready(signal).then(
      (data) => {
        if (!signal?.aborted) setDatabase({ status: 'ok', data });
      },
      (error: unknown) => {
        if (signal?.aborted) return;
        setDatabase({ status: 'error', message: messageOf(error) });
      },
    );
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const pending = service.status === 'loading' || database.status === 'loading';

  return (
    <main>
      <p className="eyebrow">Phase 1 · 工程骨架</p>
      <h1>AURA</h1>
      <p className="lead">这一页确认 Web 能访问 Server。界面还原从 Phase 2 开始。</p>
      <dl aria-live="polite">
        <div>
          <dt>服务</dt>
          <dd className={service.status === 'error' ? 'error' : undefined}>
            {textOf(service, serviceLabel)}
          </dd>
        </div>
        <div>
          <dt>时间</dt>
          <dd>{service.status === 'ok' ? service.data.time : '—'}</dd>
        </div>
        <div>
          <dt>数据库</dt>
          <dd className={database.status === 'error' ? 'error' : undefined}>
            {textOf(database, databaseLabel)}
          </dd>
        </div>
      </dl>
      <button type="button" onClick={() => load()} disabled={pending}>
        重新检查
      </button>
    </main>
  );
}

function textOf<T>(slot: Slot<T>, label: (data: T) => string): string {
  if (slot.status === 'loading') return '正在检查…';
  if (slot.status === 'error') return slot.message;
  return label(slot.data);
}

function messageOf(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  return '无法连接服务';
}

const router = createBrowserRouter([{ path: '/', element: <HealthPage /> }]);

export function App() {
  return <RouterProvider router={router} />;
}
