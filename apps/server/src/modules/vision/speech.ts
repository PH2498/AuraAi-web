import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const VOICES = ['Tingting', 'Eddy (中文（中国大陆）)'];

function run(args: string[], timeout: number): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile('say', args, { timeout }, (error) => (error ? reject(error) : resolve()));
  });
}

export async function synthesizeSpeech(text: string, rate = 1): Promise<Buffer> {
  const spoken = text.replace(/\s+/g, ' ').trim().slice(0, 800);
  if (!spoken) throw new Error('没有可以朗读的内容');
  const wordsPerMinute = String(Math.max(120, Math.min(280, Math.round(180 * (Number.isFinite(rate) && rate > 0 ? rate : 1)))));
  const dir = await mkdtemp(join(tmpdir(), 'aura-say-'));
  const file = join(dir, 'line.wav');
  try {
    let last: unknown;
    for (const voice of VOICES) {
      try {
        await run(['-v', voice, '-r', wordsPerMinute, '-o', file, '--data-format=LEI16@22050', spoken], 20_000);
        return await readFile(file);
      } catch (error) {
        last = error;
      }
    }
    try {
      await run(['-r', wordsPerMinute, '-o', file, '--data-format=LEI16@22050', spoken], 20_000);
      return await readFile(file);
    } catch (error) {
      throw error ?? last;
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
