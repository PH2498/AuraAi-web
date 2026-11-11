export type MarkdownBlock =
  | { type: 'p'; text: string }
  | { type: 'h'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'quote'; text: string }
  | { type: 'table'; header: string[]; align: Array<'left' | 'center' | 'right'>; rows: string[][] }
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
  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index]?.trim() ?? '';
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
    const next = lines[index + 1]?.trim() ?? '';
    if (isTableRow(trimmed) && isSeparator(next)) {
      flushParagraph();
      flushList();
      const header = splitRow(trimmed);
      const align = splitRow(next).map(columnAlign);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && isTableRow(lines[index]?.trim() ?? '') && !isSeparator(lines[index]?.trim() ?? '')) {
        rows.push(fitRow(splitRow(lines[index]?.trim() ?? ''), header.length));
        index += 1;
      }
      index -= 1;
      blocks.push({ type: 'table', header, align: fitAlign(align, header.length), rows });
      continue;
    }
    const quote = /^>\s?(.*)$/.exec(trimmed);
    if (quote) {
      flushParagraph();
      flushList();
      const parts = [quote[1] ?? ''];
      while (index + 1 < lines.length && /^>\s?/.test(lines[index + 1]?.trim() ?? '')) {
        index += 1;
        parts.push((lines[index]?.trim() ?? '').replace(/^>\s?/, ''));
      }
      const text = parts.join(' ').trim();
      if (text) blocks.push({ type: 'quote', text });
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

function splitRow(line: string): string[] {
  let text = line.trim();
  if (text.startsWith('|')) text = text.slice(1);
  if (text.endsWith('|')) text = text.slice(0, -1);
  return text.split('|').map((cell) => cell.trim());
}

function isTableRow(line: string): boolean {
  return line.includes('|') && splitRow(line).length >= 2;
}

function isSeparator(line: string): boolean {
  const cells = splitRow(line);
  return cells.length >= 2 && cells.every((cell) => /^:?-+:?$/.test(cell));
}

function columnAlign(cell: string): 'left' | 'center' | 'right' {
  if (cell.startsWith(':') && cell.endsWith(':')) return 'center';
  if (cell.endsWith(':')) return 'right';
  return 'left';
}

function fitAlign(align: Array<'left' | 'center' | 'right'>, width: number): Array<'left' | 'center' | 'right'> {
  return Array.from({ length: width }, (_, index) => align[index] ?? 'left');
}

function fitRow(cells: string[], width: number): string[] {
  return Array.from({ length: width }, (_, index) => cells[index] ?? '');
}
