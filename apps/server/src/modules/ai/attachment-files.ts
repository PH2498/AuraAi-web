import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let rootOverride: string | null = null;

export function setAttachmentRoot(dir: string | null): void {
  rootOverride = dir;
}

export function attachmentRoot(): string {
  return rootOverride ?? resolve(__dirname, '../../../data/attachments');
}

function filePath(userId: string, id: string): string {
  if (!UUID.test(userId) || !UUID.test(id)) throw new Error('附件编号无效');
  const root = attachmentRoot();
  const path = resolve(root, userId, id);
  if (path !== root && !path.startsWith(root + sep)) throw new Error('附件路径无效');
  return path;
}

export async function saveAttachmentFiles(userId: string, files: { id: string; bytes: Buffer }[]): Promise<void> {
  const written: string[] = [];
  try {
    for (const file of files) {
      const path = filePath(userId, file.id);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, file.bytes);
      written.push(file.id);
    }
  } catch (error) {
    await deleteAttachmentFiles(userId, written);
    throw error;
  }
}

export async function readAttachmentFile(userId: string, id: string): Promise<Buffer | null> {
  try {
    return await readFile(filePath(userId, id));
  } catch {
    return null;
  }
}

export async function deleteAttachmentFiles(userId: string, ids: string[]): Promise<void> {
  await Promise.all(ids.map(async (id) => {
    try {
      await rm(filePath(userId, id), { force: true });
    } catch {
      // A missing file or a bad id should not block deleting the conversation.
    }
  }));
}
