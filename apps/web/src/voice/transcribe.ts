export function warmVoice(): void {
  void fetch('/api/v1/voice/ready', { method: 'POST', credentials: 'include' }).catch(() => undefined);
}

export async function transcribeClip(blob: Blob): Promise<string> {
  const body = new FormData();
  const type = blob.type || 'audio/webm';
  body.append('audio', blob, type.includes('wav') ? 'clip.wav' : 'clip.webm');
  const response = await fetch('/api/v1/voice/transcriptions', { method: 'POST', credentials: 'include', body });
  const payload = (await response.json().catch(() => null)) as { text?: string; message?: string } | null;
  if (!response.ok) throw new Error(payload?.message || '这句话没有转成文字');
  return typeof payload?.text === 'string' ? payload.text.trim() : '';
}
