export function encodeWav(chunks: Float32Array[], sampleRate: number): Blob {
  let total = 0;
  for (const chunk of chunks) total += chunk.length;
  const merged = new Float32Array(total);
  let at = 0;
  for (const chunk of chunks) {
    merged.set(chunk, at);
    at += chunk.length;
  }
  const targetRate = 16000;
  const ratio = Math.max(1, sampleRate / targetRate);
  const outLength = Math.max(0, Math.floor(merged.length / ratio));
  const pcm = new Int16Array(outLength);
  for (let index = 0; index < outLength; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.min(merged.length, Math.max(start + 1, Math.floor((index + 1) * ratio)));
    let sum = 0;
    for (let sample = start; sample < end; sample += 1) sum += merged[sample];
    const value = Math.max(-1, Math.min(1, sum / (end - start)));
    pcm[index] = value < 0 ? value * 0x8000 : value * 0x7fff;
  }
  const bytes = new ArrayBuffer(44 + pcm.byteLength);
  const view = new DataView(bytes);
  const write = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
  };
  write(0, 'RIFF');
  view.setUint32(4, 36 + pcm.byteLength, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, targetRate, true);
  view.setUint32(28, targetRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, pcm.byteLength, true);
  new Int16Array(bytes, 44).set(pcm);
  return new Blob([bytes], { type: 'audio/wav' });
}
