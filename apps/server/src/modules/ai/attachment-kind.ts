import { imageKind } from '../vision/vision.policy';

const TEXT_EXT = new Set(['txt', 'md', 'json', 'csv', 'tsv', 'log', 'js', 'jsx', 'ts', 'tsx', 'py', 'css', 'html', 'xml', 'yml', 'yaml', 'toml', 'sh']);

export type AttachmentKind = { kind: 'image' | 'file'; mime: string };

export function sniffAttachment(bytes: Buffer, name: string): AttachmentKind | null {
  if (!bytes.length) return null;
  const image = imageKind(bytes);
  if (image) return { kind: 'image', mime: image };
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (bytes.subarray(0, 5).toString('ascii') === '%PDF-') return { kind: 'file', mime: 'application/pdf' };
  if (ext === 'docx' && bytes[0] === 0x50 && bytes[1] === 0x4b) {
    return { kind: 'file', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
  }
  if (ext === 'doc' && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
    return { kind: 'file', mime: 'application/msword' };
  }
  if (TEXT_EXT.has(ext) && !bytes.includes(0)) return { kind: 'file', mime: 'text/plain; charset=utf-8' };
  return null;
}
