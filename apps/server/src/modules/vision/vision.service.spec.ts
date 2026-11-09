import { describe, expect, it, vi } from 'vitest';
import { VisionService } from './vision.service';
import { VisionUnavailable } from './vision.runtime';

function service(look: ReturnType<typeof vi.fn>) {
  const audit = { record: vi.fn(async () => undefined) };
  const runtime = { look };
  return { audit, runtime, vision: new VisionService(audit as never, runtime as never) };
}

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x11]);

describe('vision analyze', () => {
  it('不是图片时不会调用模型', async () => {
    const { vision, runtime } = service(vi.fn());
    await expect(vision.analyze('user-a', { bytes: Buffer.from('hello') })).rejects.toMatchObject({
      response: { code: 'UNSUPPORTED_IMAGE' },
    });
    expect(runtime.look).not.toHaveBeenCalled();
  });

  it('没有看图模型时说明这一帧没有发出去', async () => {
    const { vision, audit } = service(vi.fn(async () => {
      throw new VisionUnavailable('本机还没有可以看图的模型。当前文字模型不会假装看过这一帧，画面也没有发给它。');
    }));
    await expect(vision.analyze('user-b', { bytes: jpeg })).rejects.toMatchObject({
      response: { message: expect.stringContaining('没有发给它') },
    });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.not.objectContaining({ image: expect.anything() }),
    }));
  });

  it('看图模型的结论只返回文字，审计里没有原图', async () => {
    const { vision, audit } = service(vi.fn(async () => ({ provider: 'ollama', model: 'llava:7b', summary: '桌上有一只杯子。\n光线从左边来。' })));
    const result = await vision.analyze('user-c', { bytes: jpeg });
    expect(result.summary).toBe('桌上有一只杯子。');
    expect(result.details).toEqual(['光线从左边来。']);
    const metadata = audit.record.mock.calls[0]?.[0].metadata as Record<string, unknown>;
    expect(metadata).toMatchObject({ status: 'ok', model: 'llava:7b', mime: 'image/jpeg' });
    expect(JSON.stringify(metadata)).not.toContain('ffd8');
  });
});
