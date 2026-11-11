import mammoth from 'mammoth';

const TEXT_LIMIT = 12_000;

export async function extractDocumentText(bytes: Buffer, mime: string): Promise<string | null> {
  try {
    if (mime.startsWith('text/')) return clip(bytes.toString('utf8').replace(/^\uFEFF/, ''));
    if (mime === 'application/pdf') return clip(await extractPdf(bytes));
    if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const result = await mammoth.extractRawText({ buffer: bytes });
      return clip(result.value);
    }
    return null;
  } catch {
    return null;
  }
}

function clip(value: string | null | undefined): string | null {
  const text = value?.replace(/\u0000/g, '').trim();
  if (!text) return null;
  return text.slice(0, TEXT_LIMIT);
}

type PdfReader = {
  getDocumentProxy: (data: Uint8Array) => Promise<unknown>;
  extractText: (data: unknown, options: { mergePages: true }) => Promise<{ text: string | string[] }>;
};

async function extractPdf(bytes: Buffer): Promise<string | null> {
  const unpdf = await loadUnpdf();
  const document = await unpdf.getDocumentProxy(new Uint8Array(bytes));
  const extracted = await unpdf.extractText(document, { mergePages: true });
  return typeof extracted.text === 'string' ? extracted.text : extracted.text.join('\n');
}

function loadUnpdf(): Promise<PdfReader> {
  return new Function('return import("unpdf")')() as Promise<PdfReader>;
}
