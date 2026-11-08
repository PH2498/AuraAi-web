import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { fail } from '../../common/http';
import type { AuthedRequest } from '../auth/session.guard';
import { AgentService } from './agent.service';

@ApiTags('agents')
@ApiCookieAuth('aura_session')
@Controller('agents')
export class AgentController {
  constructor(private readonly agents: AgentService) {}

  @Get('tasks')
  @ApiOperation({ summary: '列出当前用户的任务' })
  list(@Req() request: AuthedRequest) {
    return this.agents.list(this.userId(request));
  }

  @Post('tasks')
  @ApiOperation({ summary: '创建任务' })
  create(@Req() request: AuthedRequest, @Body() body: unknown) {
    return this.agents.create(this.userId(request), body);
  }

  @Get('tasks/:id')
  @ApiOperation({ summary: '读取任务详情' })
  get(@Req() request: AuthedRequest, @Param('id') id: string) {
    return this.agents.get(this.userId(request), id);
  }

  @Post('tasks/:id/cancel')
  @ApiOperation({ summary: '取消任务' })
  cancel(@Req() request: AuthedRequest, @Param('id') id: string) {
    return this.agents.cancel(this.userId(request), id);
  }

  @Post(':taskId/confirmations/:executionId/approve')
  @ApiOperation({ summary: '确认并执行这一步' })
  approve(@Req() request: AuthedRequest, @Param('taskId') taskId: string, @Param('executionId') executionId: string) {
    return this.agents.approve(this.userId(request), taskId, executionId);
  }

  @Post(':taskId/confirmations/:executionId/reject')
  @ApiOperation({ summary: '拒绝这一步' })
  reject(@Req() request: AuthedRequest, @Param('taskId') taskId: string, @Param('executionId') executionId: string) {
    return this.agents.reject(this.userId(request), taskId, executionId);
  }

  private userId(request: AuthedRequest): string {
    if (!request.user) fail(401, 'UNAUTHORIZED', '未授权');
    return request.user.id;
  }
}
