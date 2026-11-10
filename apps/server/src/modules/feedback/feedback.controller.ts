import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { fail } from '../../common/http';
import type { AuthedRequest } from '../auth/session.guard';
import { FeedbackService } from './feedback.service';

@ApiTags('feedback')
@ApiCookieAuth('aura_session')
@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Get()
  @ApiOperation({ summary: '列出当前用户最近的试用反馈。' })
  list(@Req() request: AuthedRequest) {
    return this.feedback.list(this.userId(request));
  }

  @Post()
  @ApiOperation({ summary: '提交一条试用反馈。正文只存在当前账号下。' })
  create(@Req() request: AuthedRequest, @Body() body: unknown) {
    return this.feedback.create(this.userId(request), body);
  }

  private userId(request: AuthedRequest): string {
    const userId = request.user?.id;
    if (!userId) fail(401, 'UNAUTHORIZED', '未授权');
    return userId;
  }
}
