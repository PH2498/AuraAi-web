import { describe, expect, it } from 'vitest';
import { composeTurn } from './compose';

describe('composeTurn', () => {
  it('没有文字也没有附件时不发送', () => {
    expect(composeTurn('  ', [])).toBeNull();
  });

  it('只有画面时用一句看图的话，文本附件跟在后面', () => {
    const turn = composeTurn('', [
      { kind: 'image', name: '屏幕.jpg' },
      { kind: 'file', name: '笔记.txt', text: '记得买牛奶' },
    ]);
    expect(turn?.display).toBe('看看这张图。');
    expect(turn?.message).toContain('看看这张图。');
    expect(turn?.message).toContain('【附件 笔记.txt】');
    expect(turn?.message).toContain('记得买牛奶');
  });

  it('只有 PDF 时也能发出去', () => {
    const turn = composeTurn('', [{ kind: 'file', name: '说明.pdf' }]);
    expect(turn?.display).toBe('看看说明.pdf');
    expect(turn?.message).toBe('看看说明.pdf');
  });
});
