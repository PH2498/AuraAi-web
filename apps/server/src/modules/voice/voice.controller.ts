import { Body, Controller, Header, Post, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { access } from 'node:fs/promises';
import { fail } from '../../common/http';
import { synthesizeSpeech } from '../vision/speech';
import { MAX_AUDIO_BYTES, audioKind, wavDurationMs } from './voice.policy';

@ApiTags('voice')
@ApiCookieAuth('aura_session')
@Controller('voice')
export class VoiceController {
  @Post('speech')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: '把文字读成一段语音。不保存音频。' })
  async speech(@Body() body: { text?: string; rate?: number }) {
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    if (!text) fail(400, 'TEXT_REQUIRED', '没有可以朗读的内容。');
    try {
      const wav = await synthesizeSpeech(text, Number(body?.rate) || 1);
      return new StreamableFile(wav, { type: 'audio/wav' });
    } catch {
      fail(503, 'SPEECH_FAILED', '这一句没有读出来。');
    }
  }

  @Post('transcriptions')
  @ApiOperation({ summary: '把一段音频转成文字。本机没有识别程序时不会假装听懂。' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { audio: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('audio', { limits: { fileSize: MAX_AUDIO_BYTES } }))
  async transcriptions(@UploadedFile() file: { buffer?: Buffer; mimetype?: string; size?: number } | undefined) {
    if (!file?.buffer?.length) fail(400, 'AUDIO_REQUIRED', '没有收到录音。');
    if (file.buffer.length > MAX_AUDIO_BYTES) fail(413, 'AUDIO_TOO_LARGE', '这段录音太长了。');
    const kind = audioKind(file.mimetype, file.buffer);
    if (!kind) fail(400, 'AUDIO_UNSUPPORTED', '这段录音的格式不能识别。');
    const durationMs = kind === 'audio/wav' ? wavDurationMs(file.buffer) : null;
    if (durationMs != null && durationMs > 120_000) fail(413, 'AUDIO_TOO_LONG', '录音请控制在两分钟以内。');
    const engine = await localTranscriber();
    fail(
      409,
      'VOICE_UNAVAILABLE',
      engine
        ? '本机识别程序还没有接上。请用页面上的语音输入，确认文字后再发送。录音没有保存。'
        : '本机没有语音识别程序。请用页面上的语音输入，确认文字后再发送。录音没有保存。',
    );
  }
}

async function localTranscriber(): Promise<string | null> {
  for (const path of ['/opt/homebrew/bin/whisper', '/usr/local/bin/whisper']) {
    try {
      await access(path);
      return path;
    } catch {
      // 继续找下一个位置。
    }
  }
  return null;
}
