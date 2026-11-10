import { describe, expect, it } from 'vitest';
import { normalizeFeedback } from './feedback.policy';

describe('normalizeFeedback', () => {
  it('trims a usable note', () => {
    expect(normalizeFeedback('  朗读慢了半拍  ')).toEqual({ ok: true, message: '朗读慢了半拍' });
  });

  it('rejects empty and oversized notes without echoing them', () => {
    expect(normalizeFeedback('   ').ok).toBe(false);
    const huge = '啊'.repeat(1001);
    const result = normalizeFeedback(huge);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).not.toContain('啊啊');
  });
});
