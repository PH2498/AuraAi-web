import { Body, Controller, Header, Post, Req, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { fail } from '../../common/http';
import type { AuthedRequest } from '../auth/session.guard';
import { MAX_IMAGE_BYTES } from './vision.policy';
import { synthesizeSpeech } from './speech';
import { VisionService } from './vision.service';

@ApiTags('vision')
@ApiCookieAuth('aura_session')
@Controller('vision')
export class VisionController {
  constructor(private readonly vision: VisionService) {}

  @Post('analyze')
  @ApiOperation({ summary: '分析一帧画面。不保存原始图片。' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { image: { type: 'string', format: 'binary' }, prompt: { type: 'string' }, provider: { type: 'string' } } } })
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: MAX_IMAGE_BYTES } }))
  analyze(@Req() request: AuthedRequest, @UploadedFile() file: { buffer?: Buffer; size?: number } | undefined, @Body() body: { prompt?: string; provider?: string; providerId?: string; model?: string }) {
    const userId = request.user?.id;
    if (!userId) fail(401, 'UNAUTHORIZED', '未授权');
    if (!file?.buffer?.length) fail(400, 'IMAGE_REQUIRED', '没有收到画面。这一帧没有发出去。');
    return this.vision.analyze(userId, { bytes: file.buffer, prompt: body?.prompt, provider: body?.provider, providerId: body?.providerId, model: body?.model });
  }

  @Post('speak')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: '把结论读成一段语音。不保存音频。' })
  async speak(@Body() body: { text?: string; rate?: number }) {
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    if (!text) fail(400, 'TEXT_REQUIRED', '没有可以朗读的内容。');
    try {
      const wav = await synthesizeSpeech(text, Number(body?.rate) || 1);
      return new StreamableFile(wav, { type: 'audio/wav' });
    } catch {
      fail(503, 'SPEECH_FAILED', '这一帧的结论没有读出来。');
    }
  }
}
