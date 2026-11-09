export const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

export function audioKind(mime: string | undefined, bytes: Buffer): 'audio/wav' | 'audio/webm' | 'audio/mpeg' | 'audio/ogg' | null {
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE') return 'audio/wav';
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return 'audio/webm';
  if (bytes.length >= 4 && bytes.toString('ascii', 0, 4) === 'OggS') return 'audio/ogg';
  if (bytes.length >= 3 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return 'audio/mpeg';
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return 'audio/mpeg';
  void mime;
  return null;
}

export function wavDurationMs(bytes: Buffer): number | null {
  if (bytes.toString('ascii', 0, 4) !== 'RIFF') return null;
  let offset = 12;
  let rate = 0;
  let channels = 0;
  let bits = 0;
  let dataBytes = 0;
  while (offset + 8 <= bytes.length) {
    const id = bytes.toString('ascii', offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (id === 'fmt ' && start + 16 <= bytes.length) {
      channels = bytes.readUInt16LE(start + 2);
      rate = bytes.readUInt32LE(start + 4);
      bits = bytes.readUInt16LE(start + 14);
    }
    if (id === 'data') dataBytes = size;
    offset = start + size + (size % 2);
  }
  if (!rate || !channels || !bits || !dataBytes) return null;
  return Math.round((dataBytes / (rate * channels * (bits / 8))) * 1000);
}
