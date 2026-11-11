import type { WebSettings } from './settings';

const VISION_HINTS = ['llava', 'moondream', 'minicpm-v', 'bakllava', 'qwen2.5vl', 'qwen2-vl', 'qwen3-vl', 'llama3.2-vision', 'internvl', 'granite3.2-vision', 'gpt-4o', 'gpt-4.1', 'gemini', 'claude-3', 'claude-4', 'pixtral', 'deepseek-flash', 'deepseek-v4-flash'];

export type CloudEndpoint = {
  id: string;
  provider: string;
  displayName: string;
  baseUrl: string | null;
  defaultModel: string | null;
  enabled: boolean;
  keyConfigured: boolean;
  keyHint: string | null;
};

export type ModelRef = { kind: 'local'; name: string } | { kind: 'cloud'; id: string };

export function localRef(name: string): string {
  return `local:${name}`;
}

export function cloudRef(id: string): string {
  return `cloud:${id}`;
}

export function parseModelRef(value: string): ModelRef | null {
  if (value.startsWith('local:')) {
    const name = value.slice('local:'.length).trim();
    return name ? { kind: 'local', name } : null;
  }
  if (value.startsWith('cloud:')) {
    const id = value.slice('cloud:'.length).trim();
    return id ? { kind: 'cloud', id } : null;
  }
  return null;
}

export function isVisionModelName(name: string): boolean {
  const lowered = name.toLowerCase();
  return VISION_HINTS.some((hint) => lowered.includes(hint));
}

export function describeChoice(value: string, endpoints: CloudEndpoint[]): { name: string; where: string; icon: 'hard-drive' | 'cloud' } {
  const parsed = parseModelRef(value);
  if (!parsed) return { name: '选择模型', where: '未选择', icon: 'hard-drive' };
  if (parsed.kind === 'local') return { name: parsed.name, where: '本地', icon: 'hard-drive' };
  const endpoint = endpoints.find((item) => item.id === parsed.id);
  if (!endpoint) return { name: '云端接口已删除', where: '云端', icon: 'cloud' };
  return { name: endpoint.defaultModel || endpoint.displayName, where: endpoint.displayName, icon: 'cloud' };
}

export function localChatReady(settings: WebSettings, ollamaReady: boolean, names: string[]): boolean {
  const parsed = parseModelRef(settings.chatModel);
  return Boolean(ollamaReady && parsed?.kind === 'local' && names.includes(parsed.name));
}

export type CloudProbe = 'ok' | 'fail';

export function cloudItemStatus(
  item: CloudEndpoint,
  localOnly: boolean,
  probe?: CloudProbe,
): { text: string; tone: 'ok' | 'warn' | 'muted' } {
  if (localOnly) return { text: '仅本地', tone: 'muted' };
  if (!item.keyConfigured) return { text: '没有密钥', tone: 'warn' };
  if (!item.defaultModel) return { text: '未配置', tone: 'warn' };
  if (probe === 'ok') return { text: '已连通', tone: 'ok' };
  if (probe === 'fail') return { text: '未连通', tone: 'warn' };
  return { text: '未测试', tone: 'warn' };
}

export function connectionLabel(
  settings: WebSettings,
  ollamaReady: boolean,
  names: string[],
  endpoints: CloudEndpoint[],
  probes: Record<string, CloudProbe>,
): { ok: boolean; text: string } {
  const parsed = parseModelRef(settings.chatModel);
  if (!parsed) return { ok: false, text: '未配置' };
  if (parsed.kind === 'local') {
    return localChatReady(settings, ollamaReady, names) ? { ok: true, text: '本机已连通' } : { ok: false, text: '本机未连通' };
  }
  if (settings.runMode === 'local-only') return { ok: false, text: '仅本地' };
  const endpoint = endpoints.find((item) => item.id === parsed.id);
  if (!endpoint || !endpoint.keyConfigured || !endpoint.defaultModel) return { ok: false, text: '未配置' };
  const probe = probes[endpoint.id];
  if (probe === 'ok') return { ok: true, text: '云端已连通' };
  if (probe === 'fail') return { ok: false, text: '云端未连通' };
  return { ok: false, text: '云端未测试' };
}

export type ChatTarget =
  | { ok: true; cloud: boolean; provider: 'ollama' | 'openai'; providerId?: string; model: string; label: string }
  | { ok: false; message: string };

export function resolveChat(settings: WebSettings, names: string[], endpoints: CloudEndpoint[]): ChatTarget {
  const parsed = parseModelRef(settings.chatModel);
  if (!parsed) return { ok: false, message: '还没有选择模型。到设置里接上本机模型，或添加一个云端接口。' };
  if (parsed.kind === 'cloud') {
    if (settings.runMode === 'local-only') return { ok: false, message: '当前是仅本地。这条不会发给云端。' };
    const endpoint = endpoints.find((item) => item.id === parsed.id && item.provider === 'openai');
    if (!endpoint) return { ok: false, message: '这个云端接口已经不在了。请重新选择。' };
    if (!endpoint.keyConfigured) return { ok: false, message: '这个云端接口还没有密钥。' };
    if (!endpoint.defaultModel) return { ok: false, message: '这个云端接口还没有填写模型名。' };
    return { ok: true, cloud: true, provider: 'openai', providerId: endpoint.id, model: endpoint.defaultModel, label: endpoint.displayName };
  }
  if (!names.includes(parsed.name)) return { ok: false, message: '本机当前没有这个模型。到本地运行里重新测试连接。' };
  return { ok: true, cloud: false, provider: 'ollama', model: parsed.name, label: parsed.name };
}

export type VisionTarget =
  | { ok: true; cloud: boolean; provider: 'ollama' | 'openai'; providerId?: string; model: string; label: string }
  | { ok: false; message: string };

export function resolveVision(settings: WebSettings, names: string[], endpoints: CloudEndpoint[]): VisionTarget {
  const parsed = parseModelRef(settings.visionModel);
  if (!parsed) return { ok: false, message: '还没有选择视觉模型。到设置里选一个能看图的本机模型，或一个云端接口。' };
  if (parsed.kind === 'cloud') {
    if (settings.runMode === 'local-only') return { ok: false, message: '当前是仅本地。这一帧不会发给云端。' };
    const endpoint = endpoints.find((item) => item.id === parsed.id && item.provider === 'openai');
    if (!endpoint) return { ok: false, message: '这个云端接口已经不在了。这一帧没有发出去。' };
    if (!endpoint.keyConfigured || !endpoint.defaultModel) return { ok: false, message: '这个云端接口还没配好。这一帧没有发出去。' };
    return { ok: true, cloud: true, provider: 'openai', providerId: endpoint.id, model: endpoint.defaultModel, label: endpoint.displayName };
  }
  if (!isVisionModelName(parsed.name) || !names.includes(parsed.name)) {
    return { ok: false, message: '这个本机模型不能看图，或当前没有安装。画面不会发给文字模型。' };
  }
  return { ok: true, cloud: false, provider: 'ollama', model: parsed.name, label: parsed.name };
}

export function replyTarget(settings: WebSettings, names: string[], endpoints: CloudEndpoint[], hasImages: boolean): ChatTarget {
  const chat = resolveChat(settings, names, endpoints);
  if (!hasImages) return chat;
  if (chat.ok && isVisionModelName(chat.model)) return chat;
  const vision = resolveVision(settings, names, endpoints);
  if (!vision.ok) return vision;
  if (!isVisionModelName(vision.model)) {
    return { ok: false, message: '选中的模型不能看图。画面不会发给文字模型，也没有保存。' };
  }
  return vision;
}
