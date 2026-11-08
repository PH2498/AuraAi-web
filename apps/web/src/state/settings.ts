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
  runMode: RunMode;
  model: ModelId;
  ollamaUrl: string;
  uploadAsk: 'ask' | 'always' | 'never';
  memoryAuto: boolean;
  retention: '30' | '90' | '365' | 'keep';
};

const KEY = 'aura-web-settings';

export const DEFAULT_SETTINGS: WebSettings = {
  os: 'auto',
  motion: 'system',
  quality: 'auto',
  dust: true,
  runMode: 'local-first',
  model: 'local',
  ollamaUrl: 'http://127.0.0.1:11434',
  uploadAsk: 'ask',
  memoryAuto: true,
  retention: '90',
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
