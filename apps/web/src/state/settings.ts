export type AuraState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'vision'
  | 'executing'
  | 'error';

export const STATE_LABEL: Record<AuraState, string> = {
  idle: '待命',
  listening: '聆听中',
  thinking: '思考中',
  speaking: '回应中',
  vision: '观察中',
  executing: '执行中',
  error: '需要处理',
};

export type ModelId = 'local' | 'gpt' | 'claude';
export type RunMode = 'local-first' | 'local-only' | 'cloud';

export const MODELS: Record<
  ModelId,
  { name: string; provider: string; where: string; cloud: boolean; icon: string }
> = {
  local: { name: 'Qwen2.5 7B', provider: 'Ollama', where: '本地', cloud: false, icon: 'hard-drive' },
  gpt: { name: 'GPT-4o', provider: 'OpenAI', where: '云端', cloud: true, icon: 'cloud' },
  claude: { name: 'Claude Sonnet 4', provider: 'Anthropic', where: '云端', cloud: true, icon: 'cloud' },
};

export type WebSettings = {
  os: 'auto' | 'mac' | 'win';
  motion: 'system' | 'full' | 'reduce';
  quality: 'auto' | 'high' | 'low';
  dust: boolean;
  openOn: 'home' | 'conversations' | 'vision';
  runMode: RunMode;
  model: ModelId;
  visionModel: ModelId;
  ollamaUrl: string;
  stt: 'browser' | 'whisper';
  autoRead: boolean;
  rate: number;
  voice: string;
  micDevice: string;
  camDevice: string;
  interval: '2' | '5' | '10' | '30';
  sensitivity: number;
  keepShots: 'session' | 'day';
  uploadAsk: 'ask' | 'always' | 'never';
  memoryAuto: boolean;
  retention: '30' | '90' | '365' | 'keep';
  gpu: 'auto' | 'high' | 'low';
  ctx: '4096' | '8192' | '16384' | '32768';
  keepAlive: '0' | '5m' | '30m' | '-1';
  autostart: boolean;
};

const KEY = 'aura-web-settings';

export const DEFAULT_SETTINGS: WebSettings = {
  os: 'auto',
  motion: 'system',
  quality: 'auto',
  dust: true,
  openOn: 'home',
  runMode: 'local-first',
  model: 'local',
  visionModel: 'local',
  ollamaUrl: 'http://127.0.0.1:11434',
  stt: 'browser',
  autoRead: false,
  rate: 1.05,
  voice: '',
  micDevice: '',
  camDevice: '',
  interval: '5',
  sensitivity: 12,
  keepShots: 'session',
  uploadAsk: 'ask',
  memoryAuto: true,
  retention: '90',
  gpu: 'auto',
  ctx: '8192',
  keepAlive: '5m',
  autostart: true,
};

export function loadSettings(): WebSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<WebSettings>;
    return { ...DEFAULT_SETTINGS, ...raw };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: WebSettings): void {
  localStorage.setItem(KEY, JSON.stringify(settings));
}

export function resolvedOs(settings: WebSettings): 'mac' | 'win' {
  if (settings.os === 'mac' || settings.os === 'win') return settings.os;
  return /Win/i.test(navigator.platform) ? 'win' : 'mac';
}

export function motionReduced(settings: WebSettings): boolean {
  if (settings.motion === 'reduce') return true;
  if (settings.motion === 'full') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
