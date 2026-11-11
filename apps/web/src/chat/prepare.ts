import { replyTarget, type ChatTarget, type CloudEndpoint } from '../state/models';
import type { WebSettings } from '../state/settings';
import type { ChatAttachment } from './attachments';
import { uploadAttachment } from './api';
import { composeTurn } from './compose';

export type PreparedSend = {
  message: string;
  display: string;
  shots: { id?: string; name: string; type: 'image' | 'file'; mime?: string; previewUrl?: string }[];
  images: { id: string }[];
  attachments: { id: string }[];
  target: Extract<ChatTarget, { ok: true }>;
  seenWith?: string;
};

export async function prepareSend(
  text: string,
  attachments: ChatAttachment[],
  settings: WebSettings,
  names: string[],
  endpoints: CloudEndpoint[],
): Promise<{ ok: true; send: PreparedSend } | { ok: false; message?: string }> {
  const composed = composeTurn(text, attachments);
  if (!composed) return { ok: false };
  const pictures = attachments.filter((item) => item.kind === 'image' && item.blob);
  const target = replyTarget(settings, names, endpoints, pictures.length > 0);
  if (!target.ok) return { ok: false, message: target.message };
  if (pictures.length > 0 && target.cloud && settings.uploadAsk === 'never') {
    return { ok: false, message: '云端上传已关闭。画面没有发出去。' };
  }
  const uploaded: { localId: string; id: string; name: string; type: 'image' | 'file'; mime: string }[] = [];
  for (const item of attachments) {
    if (!item.blob) continue;
    uploaded.push({ localId: item.id, ...(await uploadAttachment(item.blob, item.name)) });
  }
  return {
    ok: true,
    send: {
      message: composed.message,
      display: composed.display,
      shots: attachments.map((item) => {
        const saved = uploaded.find((entry) => entry.localId === item.id);
        return { id: saved?.id, name: item.name, type: item.kind, mime: saved?.mime ?? item.mime, previewUrl: item.previewUrl };
      }),
      images: uploaded.filter((item) => item.type === 'image').map((item) => ({ id: item.id })),
      attachments: uploaded.map((item) => ({ id: item.id })),
      target,
      seenWith: pictures.length > 0 ? `${target.cloud ? '云端' : '本机'}的 ${target.label}` : undefined,
    },
  };
}
