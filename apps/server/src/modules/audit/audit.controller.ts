import { Controller, Get, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { fail } from '../../common/http';
import type { AuthedRequest } from '../auth/session.guard';
import { AuditService } from './audit.service';

@ApiTags('audit')
@ApiCookieAuth('aura_session')
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @ApiOperation({ summary: '读取当前用户最近的审计记录' })
  list(@Req() request: AuthedRequest) {
    if (!request.user) fail(401, 'UNAUTHORIZED', '未授权');
    return this.audit.list(request.user.id);
  }
}
