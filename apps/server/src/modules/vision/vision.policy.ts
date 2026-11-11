export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MIN_INTERVAL_MS = 2000;

const VISION_NAMES = ['llava', 'moondream', 'minicpm-v', 'bakllava', 'qwen2.5vl', 'qwen2-vl', 'qwen3-vl', 'llama3.2-vision', 'internvl', 'granite3.2-vision'];
const CLOUD_VISION = ['gpt-4o', 'gpt-4.1', 'gemini', 'claude-3', 'claude-4', 'pixtral', 'deepseek-flash', 'deepseek-v4-flash'];

export function modelCanSee(model: string): boolean {
  const lowered = model.toLowerCase();
  return [...VISION_NAMES, ...CLOUD_VISION].some((hint) => lowered.includes(hint));
}

export function imageKind(bytes: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

export function pickVisionModel(names: string[]): string | null {
  const found = names.find((name) => VISION_NAMES.some((hint) => name.toLowerCase().includes(hint)));
  return found ?? null;
}

export function tooSoon(previous: number | undefined, now: number): boolean {
  return previous != null && now - previous < MIN_INTERVAL_MS;
}
