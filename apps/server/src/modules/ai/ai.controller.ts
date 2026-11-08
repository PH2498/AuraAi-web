import { Body, Controller, Param, Post, Req, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { fail } from '../../common/http';
import type { AuthedRequest } from '../auth/session.guard';
import { AiService } from './ai.service';

@ApiTags('chat')
@ApiCookieAuth('aura_session')
@Controller('chat')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post('completions')
  @ApiOperation({ summary: '发送一条消息并用 SSE 流式返回模型增量。请求体不含密钥。' })
  async completions(@Req() request: AuthedRequest, @Body() body: unknown, @Res() response: Response) {
    const prepared = await this.ai.prepare(this.userId(request), body);
    response.status(200);
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders?.();
    const abort = new AbortController();
    const onClose = () => {
      if (!response.writableEnded) abort.abort();
    };
    response.on('close', onClose);
    try {
      await this.ai.stream(prepared, abort.signal, (event, data) => {
        if (response.writableEnded) return;
        response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      });
    } finally {
      response.off('close', onClose);
      if (!response.writableEnded) response.end();
    }
  }

  @Post('completions/:messageId/cancel')
  @ApiOperation({ summary: '停止一条正在生成的回复' })
  cancel(@Req() request: AuthedRequest, @Param('messageId') messageId: string) {
    return this.ai.cancel(this.userId(request), messageId);
  }

  private userId(request: AuthedRequest): string {
    if (!request.user) fail(401, 'UNAUTHORIZED', '未授权');
    return request.user.id;
  }
}
