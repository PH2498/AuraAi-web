export const FEEDBACK_MAX = 1_000;
export const FEEDBACK_DAILY_LIMIT = 20;

export function normalizeFeedback(value: unknown): { ok: true; message: string } | { ok: false; message: string } {
  if (typeof value !== 'string') return { ok: false, message: '请写下要反馈的内容。' };
  const message = value.trim();
  if (!message) return { ok: false, message: '请写下要反馈的内容。' };
  if (message.length > FEEDBACK_MAX) return { ok: false, message: '反馈请控制在一千字以内。' };
  return { ok: true, message };
}
