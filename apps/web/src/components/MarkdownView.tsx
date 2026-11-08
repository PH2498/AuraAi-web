import { useState } from 'react';
import { parseMarkdown } from './markdown';
import { Icon } from './icon';

const KEYWORDS = new Set([
  'import',
  'from',
  'export',
  'function',
  'const',
  'let',
  'var',
  'return',
  'if',
  'else',
  'true',
  'false',
  'new',
  'await',
  'async',
  'for',
  'while',
  'class',
]);

export function Markdown({ text }: { text: string }) {
  return parseMarkdown(text).map((block, index) => {
    if (block.type === 'code') return <CodeBlock key={index} lang={block.lang} text={block.text} />;
    if (block.type === 'h') return <h3 key={index}>{inline(block.text)}</h3>;
    if (block.type === 'ul' || block.type === 'ol') {
      const List = block.type;
      return (
        <List key={index}>
          {block.items.map((item, itemIndex) => (
            <li key={itemIndex}>{inline(item)}</li>
          ))}
        </List>
      );
    }
    return <p key={index}>{inline(block.text)}</p>;
  });
}

function CodeBlock({ lang, text }: { lang: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="code">
      <div className="code-head">
        <span>{lang}</span>
        <button
          type="button"
          className="btn btn-sm btn-quiet"
          onClick={() => {
            void navigator.clipboard.writeText(text).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1600);
            });
          }}
        >
          <Icon name={copied ? 'check' : 'copy'} className="i i-14" />
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <pre>
        {text.split('\n').map((line, index) => (
          <span className="ln" key={index}>
            {highlight(line)}
          </span>
        ))}
      </pre>
    </div>
  );
}

function inline(text: string) {
  const nodes: Array<string | { kind: 'strong' | 'code'; text: string }> = [];
  const pattern = /\*\*(.+?)\*\*|`([^`]+)`/g;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) nodes.push(text.slice(cursor, index));
    if (match[1]) nodes.push({ kind: 'strong', text: match[1] });
    else if (match[2]) nodes.push({ kind: 'code', text: match[2] });
    cursor = index + match[0].length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes.map((node, index) => {
    if (typeof node === 'string') return node;
    if (node.kind === 'strong') return <strong key={index}>{node.text}</strong>;
    return <code key={index}>{node.text}</code>;
  });
}

function highlight(line: string) {
  const pattern = /(\/\/.*$)|('(?:\\.|[^'])*'|"(?:\\.|[^"])*")|\b(\d+(?:\.\d+)?)\b|\b([A-Za-z_]\w*)(?=\()|\b([A-Za-z_]\w*)\b/g;
  const nodes: Array<string | { className: string; text: string }> = [];
  let cursor = 0;
  for (const match of line.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) nodes.push(line.slice(cursor, index));
    const text = match[0];
    const className = match[1] ? 'tk-c' : match[2] ? 'tk-s' : match[3] ? 'tk-n' : match[4] ? 'tk-f' : KEYWORDS.has(text) ? 'tk-k' : '';
    nodes.push(className ? { className, text } : text);
    cursor = index + text.length;
  }
  if (cursor < line.length) nodes.push(line.slice(cursor));
  if (nodes.length === 0) return ' ';
  return nodes.map((node, index) => (typeof node === 'string' ? node : <span className={node.className} key={index}>{node.text}</span>));
}
