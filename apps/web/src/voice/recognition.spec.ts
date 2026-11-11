import { describe, expect, it } from 'vitest';
import { appendSpeech, foldSpeechResults } from './recognition';

describe('speech transcript', () => {
  it('keeps interim text out of the committed part', () => {
    expect(
      foldSpeechResults([
        { isFinal: true, 0: { transcript: '你好' } },
        { isFinal: false, 0: { transcript: '世界' } },
      ]),
    ).toEqual({ finalText: '你好', interimText: '世界' });
  });

  it('joins a new phrase onto what was already in the box', () => {
    expect(appendSpeech('帮我', '记一下')).toBe('帮我记一下');
    expect(appendSpeech('hello', 'world')).toBe('hello world');
    expect(appendSpeech('', '  好  ')).toBe('好');
  });
});
