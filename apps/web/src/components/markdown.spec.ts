import { describe, expect, it } from 'vitest';
import { parseMarkdown } from './markdown';

describe('parseMarkdown', () => {
  it('keeps a fenced block separate from the surrounding paragraphs', () => {
    const blocks = parseMarkdown('先看这个：\n\n```javascript\nfunction quickSort(arr) {\n  return arr;\n}\n```\n\n调用 `quickSort([])`。');
    expect(blocks.map((block) => block.type)).toEqual(['p', 'code', 'p']);
    expect(blocks[1]).toMatchObject({ lang: 'javascript', text: 'function quickSort(arr) {\n  return arr;\n}' });
  });

  it('keeps a table as rows instead of one paragraph of pipes', () => {
    const blocks = parseMarkdown(['| 项目 | 金额 |', '|---|---:|', '| 去程机票 | ¥980 |', '| 小计 | ¥3,305 |', '', '> 两人同行，机票按 2 人计算。'].join('\n'));
    expect(blocks[0]).toEqual({
      type: 'table',
      header: ['项目', '金额'],
      align: ['left', 'right'],
      rows: [
        ['去程机票', '¥980'],
        ['小计', '¥3,305'],
      ],
    });
    expect(blocks[1]).toEqual({ type: 'quote', text: '两人同行，机票按 2 人计算。' });
  });

  it('leaves a sentence that merely contains a pipe as a paragraph', () => {
    expect(parseMarkdown('选 a | b 就行')).toEqual([{ type: 'p', text: '选 a | b 就行' }]);
  });

  it('treats an unfinished fence as code while the reply is still arriving', () => {
    const blocks = parseMarkdown('```js\nconst left = [];');
    expect(blocks).toEqual([{ type: 'code', lang: 'js', text: 'const left = [];' }]);
  });
});
