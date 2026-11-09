import { describe, expect, it } from 'vitest';
import { audioKind, wavDurationMs } from './voice.policy';

describe('voice audio policy', () => {
  it('recognizes a wav and rejects an unknown file', () => {
    const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE')]);
    expect(audioKind('application/octet-stream', wav)).toBe('audio/wav');
    expect(audioKind('text/plain', Buffer.from('hello'))).toBeNull();
  });

  it('reads duration from a wav header', () => {
    const bytes = Buffer.alloc(44);
    bytes.write('RIFF', 0);
    bytes.write('WAVE', 8);
    bytes.write('fmt ', 12);
    bytes.writeUInt32LE(16, 16);
    bytes.writeUInt16LE(1, 20);
    bytes.writeUInt16LE(1, 22);
    bytes.writeUInt32LE(22050, 24);
    bytes.writeUInt16LE(16, 34);
    bytes.write('data', 36);
    bytes.writeUInt32LE(22050 * 2, 40);
    expect(wavDurationMs(bytes)).toBe(1000);
  });
});
