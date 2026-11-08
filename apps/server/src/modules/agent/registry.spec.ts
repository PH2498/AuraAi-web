import { describe, expect, it } from 'vitest';
import { findTool, inputHash, listTools, MAX_STEPS, needsConfirmation, toolTitle } from './registry';

describe('tool registry', () => {
  it('only exposes the four safe tools', () => {
    expect(listTools().map((tool) => tool.name)).toEqual([
      'get_current_time',
      'search_conversation',
      'list_memories',
      'create_note',
    ]);
    for (const name of ['shell', 'exec', 'bash', 'fetch_url', 'read_file', 'write_file']) {
      expect(findTool(name)).toBeUndefined();
    }
  });

  it('requires confirmation for medium and high risk, and rejects unknown fields', () => {
    const note = findTool('create_note');
    const time = findTool('get_current_time');
    if (!note || !time) throw new Error('工具缺失');
    expect(needsConfirmation(note)).toBe(true);
    expect(needsConfirmation(time)).toBe(false);
    expect(needsConfirmation({ ...time, riskLevel: 'high' })).toBe(true);
    expect(note.schema.safeParse({ title: '周报', body: '要点', extra: true }).success).toBe(false);
    expect(note.schema.safeParse({ title: '', body: '要点' }).success).toBe(false);
    expect(note.schema.safeParse({ title: '周报', body: '要点' }).success).toBe(true);
  });

  it('binds confirmation to a stable hash of the parsed input', () => {
    const input = { title: '周报', body: '要点' };
    expect(inputHash(input)).toBe(inputHash({ title: '周报', body: '要点' }));
    expect(inputHash(input)).not.toBe(inputHash({ title: '周报', body: '另一份' }));
    expect(MAX_STEPS).toBe(4);
    expect(toolTitle('create_note')).toBe('创建笔记');
  });
});
