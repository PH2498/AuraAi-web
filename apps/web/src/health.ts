import type { HealthReadyStatus, HealthStatus } from '@aura/shared-types';

export function serviceLabel(health: HealthStatus): string {
  return health.status === 'ok' ? '服务正常' : '服务异常';
}

export function databaseLabel(ready: HealthReadyStatus): string {
  return ready.database === 'up' ? '数据库已就绪' : '数据库未就绪';
}
