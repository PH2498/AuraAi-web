import { describe, expect, it } from 'vitest';
import type { DatabaseService } from '../../database/database.service';
import { HealthService } from './health.service';

function fakeDatabase(ping: DatabaseService['ping']): DatabaseService {
  return { ping } as DatabaseService;
}

describe('HealthService', () => {
  it('reports the process as live without contacting the database', () => {
    const service = new HealthService(
      fakeDatabase(() => {
        throw new Error('postgresql://aura:aura_dev@localhost:5432/aura');
      }),
    );

    const live = service.live();
    expect(live).toMatchObject({ status: 'ok', service: 'aura-server' });
    expect(live.time).toContain('T');
  });

  it('reports a down database without a connection string', async () => {
    const service = new HealthService(fakeDatabase(async () => false));
    const ready = await service.ready();

    expect(ready).toMatchObject({ database: 'down' });
    expect(JSON.stringify(ready)).not.toContain('postgres');
  });
});
