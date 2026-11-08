import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @ApiOperation({ summary: '进程存活检查' })
  @ApiOkResponse({ description: '服务进程正常' })
  live() {
    return this.health.live();
  }

  @Get('ready')
  @ApiOperation({ summary: '依赖就绪检查' })
  @ApiOkResponse({ description: '数据库可连接' })
  async ready() {
    const result = await this.health.ready();
    if (result.database !== 'up') {
      throw new HttpException(
        {
          code: 'INTERNAL_ERROR',
          message: '数据库未就绪',
          details: { database: 'down' },
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return result;
  }
}
