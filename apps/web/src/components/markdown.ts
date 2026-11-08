export type MarkdownBlock =
  | { type: 'p'; text: string }
  | { type: 'h'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'code'; lang: string; text: string };

export function parseMarkdown(source: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const parts = source.replace(/\r\n/g, '\n').split('```');
  parts.forEach((part, index) => {
    if (index % 2 === 1) {
      const breakAt = part.indexOf('\n');
      const lang = (breakAt === -1 ? part : part.slice(0, breakAt)).trim();
      const text = (breakAt === -1 ? '' : part.slice(breakAt + 1)).replace(/\n$/, '');
      blocks.push({ type: 'code', lang: lang || 'text', text });
      return;
    }
    parseProse(part, blocks);
  });
  return blocks;
}

function parseProse(source: string, blocks: MarkdownBlock[]) {
  const lines = source.split('\n');
  let paragraph: string[] = [];
  let list: { type: 'ul' | 'ol'; items: string[] } | null = null;
  const flushParagraph = () => {
    const text = paragraph.join(' ').trim();
    if (text) blocks.push({ type: 'p', text });
    paragraph = [];
  };
  const flushList = () => {
    if (list?.items.length) blocks.push({ type: list.type, items: list.items });
    list = null;
  };
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (heading?.[2]) {
      flushParagraph();
      flushList();
      blocks.push({ type: 'h', text: heading[2] });
      continue;
    }
    const bullet = /^[-*]\s+(.+)$/.exec(trimmed);
    const ordered = /^\d+[.)]\s+(.+)$/.exec(trimmed);
    if (bullet?.[1] || ordered?.[1]) {
      flushParagraph();
      const type = bullet ? 'ul' : 'ol';
      if (!list || list.type !== type) {
        flushList();
        list = { type, items: [] };
      }
      list.items.push(bullet?.[1] ?? ordered?.[1] ?? '');
      continue;
    }
    flushList();
    paragraph.push(trimmed);
  }
  flushParagraph();
  flushList();
}
