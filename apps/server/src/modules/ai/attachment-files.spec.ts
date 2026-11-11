import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { deleteAttachmentFiles, readAttachmentFile, saveAttachmentFiles, setAttachmentRoot } from './attachment-files';

const userId = '11111111-1111-4111-8111-111111111111';
const fileId = '22222222-2222-4222-8222-222222222222';
let dir = '';

afterEach(async () => {
  setAttachmentRoot(null);
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = '';
});

describe('attachment files', () => {
  it('按用户保存原件，坏编号不会写出目录', async () => {
    dir = await mkdtemp(join(tmpdir(), 'aura-attachments-'));
    setAttachmentRoot(dir);
    await saveAttachmentFiles(userId, [{ id: fileId, bytes: Buffer.from('记得买牛奶') }]);
    expect((await readAttachmentFile(userId, fileId))?.toString()).toBe('记得买牛奶');
    expect(await readAttachmentFile('33333333-3333-4333-8333-333333333333', fileId)).toBeNull();
    await expect(saveAttachmentFiles(userId, [{ id: '../secret', bytes: Buffer.from('no') }])).rejects.toThrow();
    await deleteAttachmentFiles(userId, [fileId, 'not-an-id']);
    expect(await readAttachmentFile(userId, fileId)).toBeNull();
  });
});
