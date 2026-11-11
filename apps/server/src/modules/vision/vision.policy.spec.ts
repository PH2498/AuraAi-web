import { describe, expect, it } from 'vitest';
import { imageKind, modelCanSee, pickVisionModel, tooSoon } from './vision.policy';

describe('vision policy', () => {
  it('只认 jpeg、png 和 webp 的文件头', () => {
    expect(imageKind(Buffer.from([0xff, 0xd8, 0xff, 0x00]))).toBe('image/jpeg');
    expect(imageKind(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))).toBe('image/png');
    const webp = Buffer.alloc(12);
    webp.write('RIFF', 0);
    webp.write('WEBP', 8);
    expect(imageKind(webp)).toBe('image/webp');
    expect(imageKind(Buffer.from('not-an-image'))).toBeNull();
  });

  it('只挑本机已经安装的看图模型', () => {
    expect(pickVisionModel(['qwen2.5:7b', 'qwen3:8b'])).toBeNull();
    expect(pickVisionModel(['qwen2.5:7b', 'llava:7b'])).toBe('llava:7b');
  });

  it('文字模型不能收画面', () => {
    expect(modelCanSee('deepseek-chat')).toBe(false);
    expect(modelCanSee('deepseek-flash')).toBe(true);
    expect(modelCanSee('qwen2.5:7b')).toBe(false);
    expect(modelCanSee('qwen2.5vl:3b')).toBe(true);
    expect(modelCanSee('gpt-4o')).toBe(true);
  });

  it('两秒内的下一帧算太快', () => {
    expect(tooSoon(1000, 2500)).toBe(true);
    expect(tooSoon(1000, 3000)).toBe(false);
    expect(tooSoon(undefined, 3000)).toBe(false);
  });
});
