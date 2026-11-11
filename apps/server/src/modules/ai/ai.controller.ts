import { Body, Controller, Get, Param, Post, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { fail } from '../../common/http';
import type { AuthedRequest } from '../auth/session.guard';
import { MAX_IMAGE_BYTES } from '../vision/vision.policy';
import { sniffAttachment } from './attachment-kind';
import { AiService } from './ai.service';
import { frameName, holdAttachment, holdFrame } from './frames';

const MAX_FILE_BYTES = 10 * 1024 * 1024;

@ApiTags('chat')
@ApiCookieAuth('aura_session')
@Controller('chat')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post('frames')
  @ApiOperation({ summary: '暂存一张即将随对话发送的画面。不写入数据库，两分钟后丢弃。' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { image: { type: 'string', format: 'binary' }, name: { type: 'string' } } } })
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: MAX_IMAGE_BYTES } }))
  frame(@Req() request: AuthedRequest, @UploadedFile() file: { buffer?: Buffer } | undefined, @Body() body: { name?: string }) {
    const userId = this.userId(request);
    if (!file?.buffer?.length) fail(400, 'IMAGE_REQUIRED', '没有收到画面。这一帧没有发出去。');
    const sniffed = sniffAttachment(file.buffer, frameName(body?.name));
    if (sniffed?.kind !== 'image') fail(400, 'UNSUPPORTED_IMAGE', '这一帧不是 jpeg、png 或 webp，没有发出去。');
    const held = holdFrame(userId, file.buffer, sniffed.mime, frameName(body?.name));
    if (!held.ok) fail(409, 'TOO_MANY_FRAMES', held.message);
    return { id: held.id, name: frameName(body?.name), type: 'image' as const };
  }

  @Post('attachments')
  @ApiOperation({ summary: '暂存即将随对话发送的图片、PDF 或文档。发送成功后写入这次会话。' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' }, name: { type: 'string' } } } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES } }))
  attach(@Req() request: AuthedRequest, @UploadedFile() file: { buffer?: Buffer } | undefined, @Body() body: { name?: string }) {
    const userId = this.userId(request);
    if (!file?.buffer?.length) fail(400, 'FILE_REQUIRED', '没有收到文件。');
    if (file.buffer.length > MAX_FILE_BYTES) fail(400, 'FILE_TOO_LARGE', '这份文件超过 10MB，没有放进对话。');
    const name = frameName(body?.name);
    const sniffed = sniffAttachment(file.buffer, name);
    if (!sniffed) fail(400, 'UNSUPPORTED_FILE', '这个文件不能放进对话。可以附加图片、PDF、Word 文档，或 txt、md 这类文本。');
    if (sniffed.kind === 'image' && file.buffer.length > MAX_IMAGE_BYTES) fail(400, 'FILE_TOO_LARGE', '这张图超过 5MB，没有放进对话。');
    const held = holdAttachment(userId, file.buffer, sniffed.mime, name, sniffed.kind);
    if (!held.ok) fail(409, 'TOO_MANY_ATTACHMENTS', held.message);
    return { id: held.id, name, type: sniffed.kind, mime: sniffed.mime };
  }

  @Get('attachments/:id')
  @ApiOperation({ summary: '读取当前用户会话里保存的附件' })
  async open(@Req() request: AuthedRequest, @Param('id') id: string, @Res() response: Response) {
    const file = await this.ai.openAttachment(this.userId(request), id);
    if (!file) fail(404, 'NOT_FOUND', '没有找到这个附件');
    const inline = file.mime.startsWith('image/') || file.mime === 'application/pdf' || file.mime.startsWith('text/');
    response.setHeader('Content-Type', file.mime);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'private, max-age=86400');
    response.setHeader('Content-Disposition', contentDisposition(file.name, inline));
    response.end(file.bytes);
  }

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

function contentDisposition(name: string, inline: boolean): string {
  const fallback = name.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_') || 'file';
  return `${inline ? 'inline' : 'attachment'}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
