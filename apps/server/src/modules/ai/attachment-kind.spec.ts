import { describe, expect, it } from 'vitest';
import { sniffAttachment } from './attachment-kind';

describe('sniffAttachment', () => {
  it('认出图片、PDF、Word 和文本，拒绝别的文件', () => {
    expect(sniffAttachment(Buffer.from([0xff, 0xd8, 0xff, 0x00]), '画面.jpg')?.kind).toBe('image');
    expect(sniffAttachment(Buffer.from('%PDF-1.4'), '说明.pdf')?.mime).toBe('application/pdf');
    expect(sniffAttachment(Buffer.from([0x50, 0x4b, 0x03, 0x04]), '稿.docx')?.kind).toBe('file');
    expect(sniffAttachment(Buffer.from('记得买牛奶'), '笔记.txt')?.mime).toContain('text/plain');
    expect(sniffAttachment(Buffer.from([0, 1, 2, 3]), '程序.exe')).toBeNull();
    expect(sniffAttachment(Buffer.alloc(0), '空.txt')).toBeNull();
  });
});
