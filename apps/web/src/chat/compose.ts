export type ComposeAttachment = { kind: 'image' | 'file'; name: string; text?: string };

export function composeTurn(
  ask: string,
  attachments: ComposeAttachment[],
): { message: string; display: string } | null {
  const typed = ask.trim();
  const images = attachments.filter((item) => item.kind === 'image');
  const files = attachments.filter((item) => item.kind === 'file');
  const readable = files.filter((item) => item.text?.trim());
  if (!typed && images.length === 0 && files.length === 0) return null;
  const display = typed || (images.length > 0 ? '看看这张图。' : `看看${files[0]?.name ?? '这份文件'}`);
  const blocks = readable.map((file) => `【附件 ${file.name}】\n${file.text?.trim().slice(0, 8000)}`);
  return { display, message: [display, ...blocks].join('\n\n').slice(0, 20_000) };
}
