import { describe, expect, it } from 'vitest';
import { frameName, holdFrame, resetFrames, takeFrames } from './frames';

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]);

describe('chat frames', () => {
  it('只把画面交给上传的人，取走后就不再保留', () => {
    resetFrames();
    const held = holdFrame('user-a', jpeg, 'image/jpeg', '屏幕.jpg');
    expect(held.ok).toBe(true);
    if (!held.ok) return;
    expect(takeFrames('user-b', [held.id])).toEqual([]);
    expect(takeFrames('user-a', [held.id])).toHaveLength(1);
    expect(takeFrames('user-a', [held.id])).toEqual([]);
  });

  it('一次最多留下 4 张，文件名去掉路径', () => {
    resetFrames();
    expect(frameName('../秘密/屏幕.jpg')).toBe('屏幕.jpg');
    for (let index = 0; index < 4; index += 1) {
      expect(holdFrame('user-c', jpeg, 'image/jpeg', '画面.jpg').ok).toBe(true);
    }
    expect(holdFrame('user-c', jpeg, 'image/jpeg', '画面.jpg')).toMatchObject({ ok: false });
  });
});
