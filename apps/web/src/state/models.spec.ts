import { describe, expect, it } from 'vitest';
import { replyTarget } from './models';
import { DEFAULT_SETTINGS } from './settings';

describe('replyTarget', () => {
  it('没有画面时仍发给对话模型', () => {
    const settings = { ...DEFAULT_SETTINGS, chatModel: 'local:qwen2.5:7b' };
    expect(replyTarget(settings, ['qwen2.5:7b'], [], false)).toMatchObject({ ok: true, model: 'qwen2.5:7b' });
  });

  it('文字对话模型不会收到画面，改发给能看图的模型', () => {
    const settings = { ...DEFAULT_SETTINGS, chatModel: 'local:qwen2.5:7b', visionModel: 'local:qwen2.5vl:3b' };
    expect(replyTarget(settings, ['qwen2.5:7b', 'qwen2.5vl:3b'], [], true)).toMatchObject({ ok: true, model: 'qwen2.5vl:3b' });
  });

  it('deepseek-flash 能看图，文字云端模型仍然不能', () => {
    const flash = {
      id: 'cloud-1',
      provider: 'openai',
      displayName: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com/v1',
      defaultModel: 'deepseek-flash',
      enabled: true,
      keyConfigured: true,
      keyHint: null,
    };
    const textOnly = { ...flash, id: 'cloud-2', defaultModel: 'deepseek-chat' };
    const flashSettings = { ...DEFAULT_SETTINGS, chatModel: 'cloud:cloud-1', visionModel: '' };
    const textSettings = { ...DEFAULT_SETTINGS, chatModel: 'cloud:cloud-2', visionModel: 'cloud:cloud-2' };
    expect(replyTarget(flashSettings, [], [flash], true)).toMatchObject({ ok: true, model: 'deepseek-flash' });
    expect(replyTarget(textSettings, [], [textOnly], true)).toMatchObject({ ok: false });
  });
});