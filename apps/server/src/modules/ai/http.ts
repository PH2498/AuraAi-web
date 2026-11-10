export async function* readLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n');
      buffer = parts.pop() ?? '';
      for (const part of parts) {
        const line = part.trim();
        if (line) yield line;
      }
    }
  } finally {
    reader.releaseLock();
  }
  buffer += decoder.decode();
  const rest = buffer.trim();
  if (rest) yield rest;
}

export function providerMessage(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } | string };
    const message = typeof parsed.error === 'string' ? parsed.error : parsed.error?.message;
    if (message && message.length <= 180 && !/sk-|api[\s_-]*key|bearer |request[_ ]?id/i.test(message)) return message;
  } catch {
    // 响应不是 JSON 时使用下面的通用说明。
  }
  if (status === 401 || status === 403) return '密钥被拒绝。请核对密钥和地址。';
  if (status === 404) return '模型或地址不存在';
  return '模型服务暂时不可用';
}

export function originOf(baseUrl: string): string {
  const url = new URL(baseUrl);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('提供方地址无效');
  }
  return url.origin + url.pathname.replace(/\/$/, '');
}
