import { randomUUID } from 'node:crypto';

const TTL_MS = 120_000;
const MAX_IMAGES = 4;
const MAX_TOTAL = 8;

export type HeldAttachment = {
  id: string;
  userId: string;
  bytes: Buffer;
  mime: string;
  name: string;
  kind: 'image' | 'file';
  at: number;
};

const held = new Map<string, Omit<HeldAttachment, 'id'>>();

export function frameName(value: string | undefined): string {
  const base = (value ?? '').split(/[/\\]/).pop()?.replace(/[\u0000-\u001f]/g, '').trim() || '画面.jpg';
  return base.slice(0, 80);
}

function sweep(now = Date.now()): void {
  for (const [id, frame] of held) {
    if (now - frame.at > TTL_MS) held.delete(id);
  }
}

export function holdFrame(
  userId: string,
  bytes: Buffer,
  mime: string,
  name: string,
): { ok: true; id: string } | { ok: false; message: string } {
  return holdAttachment(userId, bytes, mime, name, 'image');
}

export function holdAttachment(
  userId: string,
  bytes: Buffer,
  mime: string,
  name: string,
  kind: 'image' | 'file',
): { ok: true; id: string } | { ok: false; message: string } {
  sweep();
  const tally = countFor(userId);
  if (kind === 'image' && tally.images >= MAX_IMAGES) return { ok: false, message: '一次最多带 4 张画面。先发送，或去掉一张。' };
  if (tally.total >= MAX_TOTAL) return { ok: false, message: '一次最多 8 个附件。先发送，或去掉一个。' };
  const id = randomUUID();
  held.set(id, { userId, bytes, mime, name, kind, at: Date.now() });
  return { ok: true, id };
}

export function peekAttachments(userId: string, ids: string[]): HeldAttachment[] {
  sweep();
  const frames: HeldAttachment[] = [];
  for (const id of ids) {
    const frame = held.get(id);
    if (!frame || frame.userId !== userId) continue;
    frames.push({ ...frame, id });
  }
  return frames;
}

export function forgetAttachments(userId: string, ids: string[]): void {
  for (const id of ids) {
    const frame = held.get(id);
    if (frame?.userId === userId) held.delete(id);
  }
}

export function takeFrames(userId: string, ids: string[]): HeldAttachment[] {
  const frames = peekAttachments(userId, ids);
  forgetAttachments(userId, frames.map((frame) => frame.id));
  return frames;
}

function countFor(userId: string): { images: number; total: number } {
  let images = 0;
  let total = 0;
  for (const frame of held.values()) {
    if (frame.userId !== userId) continue;
    total += 1;
    if (frame.kind === 'image') images += 1;
  }
  return { images, total };
}

export function resetFrames(): void {
  held.clear();
}
