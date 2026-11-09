import { describe, expect, it } from 'vitest';
import { initialStatus, memoryContext } from './memory.policy';

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
});
