import { describe, expect, it } from 'vitest';
import { citedMemories, initialStatus, memoryContext } from './memory.policy';

describe('memory policy', () => {
  it('keeps manual memories active and proposals pending', () => {
    expect(initialStatus('manual')).toBe('active');
    expect(initialStatus('conversation')).toBe('pending');
    expect(initialStatus('agent')).toBe('pending');
  });

  it('does not put pending memories into the model context', () => {
    const text = memoryContext([
      { content: '已确认的偏好', status: 'active' },
      { content: '还没确认', status: 'pending' },
    ]);
    expect(text).toContain('已确认的偏好');
    expect(text).not.toContain('还没确认');
  });

  it('cites only memories the conversation actually mentions', () => {
    const items = [
      { id: 'en', content: '你记住我的英文名叫Rice' },
      { id: 'cn', content: '用户的名字叫白居易' },
    ];
    expect(citedMemories(items, '我的英文名叫什么\n你的英文名是 Rice。').map((item) => item.id)).toEqual(['en']);
    expect(citedMemories(items, '这是个什么\n我没有收到图片。')).toEqual([]);
    expect(citedMemories(items, '我是谁\n你是白居易。').map((item) => item.id)).toEqual(['cn']);
  });
});
