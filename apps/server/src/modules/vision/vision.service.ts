import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { VisionAnalyzeResult } from '@aura/shared-types';
import { fail } from '../../common/http';
import { AuditService } from '../audit/audit.service';
import { MAX_IMAGE_BYTES, imageKind, tooSoon } from './vision.policy';
import { DEFAULT_VISION_PROMPT, VisionRuntime, VisionUnavailable } from './vision.runtime';

const recent = new Map<string, number>();

@Injectable()
export class VisionService {
  constructor(
    private readonly audit: AuditService,
    private readonly runtime: VisionRuntime,
  ) {}

  async analyze(userId: string, input: { bytes: Buffer; prompt?: string; provider?: string; providerId?: string; model?: string }): Promise<VisionAnalyzeResult> {
    const kind = imageKind(input.bytes);
    if (!kind) fail(400, 'UNSUPPORTED_IMAGE', '这一帧不是 jpeg、png 或 webp，没有发出去。');
    if (input.bytes.length > MAX_IMAGE_BYTES) fail(413, 'IMAGE_TOO_LARGE', '这一帧超过 5MB，没有发出去。');
    const now = Date.now();
    if (tooSoon(recent.get(userId), now)) fail(429, 'VISION_TOO_FAST', '两帧之间至少隔 2 秒。这一帧没有发出去。');
    recent.set(userId, now);

    const provider = input.provider === 'openai' || input.provider === 'anthropic' ? input.provider : 'ollama';
    if (!input.providerId && provider === 'anthropic') {
      await this.audit.record({ userId, action: 'vision.analyze', resourceType: 'vision', metadata: { status: 'refused', bytes: input.bytes.length, mime: kind } });
      fail(409, 'VISION_UNAVAILABLE', '这个接口还不能看图。这一帧没有发出去。');
    }

    const started = Date.now();
    try {
      const result = await this.runtime.look(
        userId,
        { providerId: input.providerId, provider: input.providerId ? input.provider : provider, model: input.model },
        input.bytes,
        (input.prompt || DEFAULT_VISION_PROMPT).slice(0, 400),
        AbortSignal.timeout(45_000),
      );
      const lines = result.summary.split('\n').map((line) => line.trim()).filter(Boolean);
      await this.audit.record({
        userId,
        action: 'vision.analyze',
        resourceType: 'vision',
        metadata: { status: 'ok', provider: result.provider, model: result.model, bytes: input.bytes.length, mime: kind, durationMs: Date.now() - started },
      });
      return {
        id: randomUUID(),
        summary: lines[0] ?? result.summary,
        details: lines.slice(1),
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      await this.audit.record({
        userId,
        action: 'vision.analyze',
        resourceType: 'vision',
        metadata: { status: 'failed', provider, bytes: input.bytes.length, mime: kind, durationMs: Date.now() - started },
      });
      if (error instanceof VisionUnavailable) fail(409, 'VISION_UNAVAILABLE', error.message);
      fail(502, 'VISION_FAILED', '视觉模型没有完成这一帧。原图没有保存。');
    }
  }
}
