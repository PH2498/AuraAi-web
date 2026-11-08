import { describe, expect, it } from 'vitest';
import { databaseLabel, serviceLabel } from './health';

describe('health labels', () => {
  it('describes a live service', () => {
    expect(
      serviceLabel({ status: 'ok', service: 'aura-server', time: '2026-11-08T00:00:00.000Z' }),
    ).toBe('服务正常');
  });

  it('describes a ready database', () => {
    expect(databaseLabel({ status: 'ok', database: 'up', time: '2026-11-08T00:00:00.000Z' })).toBe(
      '数据库已就绪',
    );
  });
});
