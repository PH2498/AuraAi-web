const TEXT_EXT = new Set(['txt', 'md', 'json', 'csv', 'tsv', 'log', 'js', 'jsx', 'ts', 'tsx', 'py', 'css', 'html', 'xml', 'yml', 'yaml', 'toml', 'sh']);
const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);
const DOC_EXT = new Set(['pdf', 'doc', 'docx']);
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const REJECTED = '这个文件不能放进对话。可以附加图片、PDF、Word 文档，或 txt、md 这类文本。';

export type ChatAttachment = {
  id: string;
  kind: 'image' | 'file';
  name: string;
  blob?: Blob;
  previewUrl?: string;
  text?: string;
  mime?: string;
};

export const MAX_IMAGES = 4;
export const MAX_ATTACHMENTS = 8;

export async function imageBlob(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('这台浏览器画不出这张图');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    if (!blob) throw new Error('这张图没有压缩成功');
    if (blob.size > 5 * 1024 * 1024) throw new Error('这张图超过 5MB，没有放进对话。');
    return blob;
  } finally {
    bitmap.close();
  }
}

export async function attachmentFromFile(file: File): Promise<ChatAttachment> {
  const name = file.name.slice(0, 80) || '附件';
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const image = file.type.startsWith('image/') || IMAGE_EXT.has(ext);
  if (image) {
    const blob = await imageBlob(file);
    return { id: crypto.randomUUID(), kind: 'image', name, blob, previewUrl: URL.createObjectURL(blob), mime: 'image/jpeg' };
  }
  if (file.size > MAX_FILE_BYTES) throw new Error('这份文件超过 10MB，没有放进对话。');
  if (!DOC_EXT.has(ext) && !TEXT_EXT.has(ext)) throw new Error(REJECTED);
  let text: string | undefined;
  if (TEXT_EXT.has(ext)) {
    text = await file.text();
    if (text.includes('\u0000')) throw new Error(REJECTED);
    text = text.slice(0, 8000);
  }
  return {
    id: crypto.randomUUID(),
    kind: 'file',
    name,
    blob: file,
    previewUrl: URL.createObjectURL(file),
    text,
    mime: mimeFor(ext),
  };
}

export function imageAttachment(name: string, blob: Blob): ChatAttachment {
  return { id: crypto.randomUUID(), kind: 'image', name: name.slice(0, 80), blob, previewUrl: URL.createObjectURL(blob), mime: 'image/jpeg' };
}

function mimeFor(ext: string): string {
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (ext === 'doc') return 'application/msword';
  return 'text/plain';
}
