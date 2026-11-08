import { useMemo, useState } from 'react';
import { useCoreSlot } from '../components/aura-core/CoreProvider';
import { Icon } from '../components/icon';
import { MEMORY_CATS, MEMORY_SEED, type MemoryItem } from '../fixtures/content';

const KEY = 'aura-memories';

function load(): MemoryItem[] {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || 'null') as MemoryItem[] | null;
    return Array.isArray(stored) ? stored : MEMORY_SEED;
  } catch {
    return MEMORY_SEED;
  }
}

export function MemoryPage() {
  const slot = useCoreSlot<HTMLButtonElement>(true);
  const [items, setItems] = useState<MemoryItem[]>(load);
  const [query, setQuery] = useState('');
  const [current, setCurrent] = useState<MemoryItem | null>(null);
  const [draft, setDraft] = useState('');
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => !q || `${item.text} ${item.source}`.toLowerCase().includes(q));
  }, [items, query]);

  const save = (next: MemoryItem[]) => {
    setItems(next);
    localStorage.setItem(KEY, JSON.stringify(next));
  };

  return (
    <main className="page mem">
      <header className="mhead">
        <button ref={slot} className="core-slot" type="button" aria-hidden="true" tabIndex={-1} />
        <div className="ttl">
          <h1>记忆</h1>
          <p className="sub">这些是设计演示条目，存在这台浏览器里。模型还不能自己写入记忆。</p>
        </div>
        <div className="acts">
          <div className="search">
            <Icon name="search" />
            <input className="input" value={query} placeholder="搜索记忆" aria-label="搜索记忆" onChange={(event) => setQuery(event.target.value)} />
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              const text = window.prompt('添加一条你自己的记忆');
              if (!text?.trim()) return;
              save([
                { id: `m-${Date.now()}`, cat: 'pref', text: text.trim(), source: '你手动添加', at: '刚刚', pinned: false },
                ...items,
              ]);
            }}
          >
            <Icon name="plus" />
            添加
          </button>
        </div>
      </header>
      <div className="board scroll fade-edges">
        {visible.length === 0 ? <p className="empty-state">没有匹配的记忆。</p> : null}
        {(Object.keys(MEMORY_CATS) as (keyof typeof MEMORY_CATS)[]).map((cat) => {
          const group = visible.filter((item) => item.cat === cat);
          if (!group.length) return null;
          return (
            <section key={cat} className="group">
              <h2>
                {MEMORY_CATS[cat]}
                <span>{group.length}</span>
              </h2>
              {group.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="mrow"
                  data-pin={item.pinned ? 'true' : 'false'}
                  aria-current={current?.id === item.id}
                  onClick={() => {
                    setCurrent(item);
                    setDraft(item.text);
                  }}
                >
                  <Icon name="pin" className="i pin" />
                  <span className="tx">{item.text}</span>
                  <span className="meta">
                    <span>{item.source}</span>
                    <span>{item.at}</span>
                  </span>
                </button>
              ))}
            </section>
          );
        })}
      </div>
      <aside className={`sheet${current ? ' open' : ''}`} role="dialog" aria-modal="true" aria-label="记忆">
        {current ? (
          <>
            <div className="sheet-head">
              <h2>记忆</h2>
              <button type="button" className="icon-btn" aria-label="关闭" onClick={() => setCurrent(null)}>
                <Icon name="x" />
              </button>
            </div>
            <div className="sheet-body">
              <p className="muted">{current.source}</p>
              <textarea className="input" value={draft} aria-label="记忆内容" onChange={(event) => setDraft(event.target.value)} />
            </div>
            <div className="sheet-foot">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  save(items.map((item) => (item.id === current.id ? { ...item, text: draft } : item)));
                  setCurrent(null);
                }}
              >
                保存
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  save(items.filter((item) => item.id !== current.id));
                  setCurrent(null);
                }}
              >
                删除
              </button>
            </div>
          </>
        ) : null}
      </aside>
    </main>
  );
}
