import { describe, expect, it } from 'vitest';
import { parseMarkdown } from './markdown';

describe('parseMarkdown', () => {
  it('keeps a fenced block separate from the surrounding paragraphs', () => {
    const blocks = parseMarkdown('先看这个：\n\n```javascript\nfunction quickSort(arr) {\n  return arr;\n}\n```\n\n调用 `quickSort([])`。');
    expect(blocks.map((block) => block.type)).toEqual(['p', 'code', 'p']);
    expect(blocks[1]).toMatchObject({ lang: 'javascript', text: 'function quickSort(arr) {\n  return arr;\n}' });
  });

  it('treats an unfinished fence as code while the reply is still arriving', () => {
    const blocks = parseMarkdown('```js\nconst left = [];');
    expect(blocks).toEqual([{ type: 'code', lang: 'js', text: 'const left = [];' }]);
  });
});
