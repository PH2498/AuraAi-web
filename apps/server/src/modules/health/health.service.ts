import { Injectable } from '@nestjs/common';
import type { HealthReadyStatus, HealthStatus } from '@aura/shared-types';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class HealthService {
  constructor(private readonly database: DatabaseService) {}

  live(): HealthStatus {
    return {
      status: 'ok',
      service: 'aura-server',
      time: new Date().toISOString(),
    };
  }

  async ready(): Promise<HealthReadyStatus | { database: 'down'; time: string }> {
    const up = await this.database.ping();
    return {
      ...(up ? { status: 'ok' as const, database: 'up' as const } : { database: 'down' as const }),
      time: new Date().toISOString(),
    };
  }
}
