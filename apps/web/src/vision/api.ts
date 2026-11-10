import type { VisionAnalyzeResult } from '@aura/shared-types';

export async function analyzeFrame(
  image: Blob,
  target: { provider: 'ollama' | 'openai'; providerId?: string; model?: string },
): Promise<VisionAnalyzeResult> {
  const body = new FormData();
  body.set('image', image, 'frame.jpg');
  body.set('provider', target.provider);
  if (target.providerId) body.set('providerId', target.providerId);
  if (target.model) body.set('model', target.model);
  const response = await fetch('/api/v1/vision/analyze', { method: 'POST', credentials: 'include', body });
  const payload = (await response.json().catch(() => null)) as (VisionAnalyzeResult & { message?: string }) | null;
  if (!response.ok) throw new Error(payload?.message || '这一帧没有分析完');
  if (!payload?.summary) throw new Error('这一帧没有分析完');
  return payload;
}

export async function fetchSpeech(text: string, rate: number): Promise<ArrayBuffer> {
  const response = await fetch('/api/v1/voice/speech', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, rate }),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message || '这一帧的结论没有读出来');
  }
  return response.arrayBuffer();
}

export function captureFrame(video: HTMLVideoElement): Promise<Blob> {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return Promise.reject(new Error('画面还没有准备好'));
  const scale = Math.min(1, 1280 / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  if (!context) return Promise.reject(new Error('这台浏览器画不出这一帧'));
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('这一帧没有压缩成功'))), 'image/jpeg', 0.8);
  });
}
