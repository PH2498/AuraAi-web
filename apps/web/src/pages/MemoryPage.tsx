import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSession } from '../app/session';
import { useCoreSlot } from '../components/aura-core/CoreProvider';
import { EmptyState } from '../components/empty-state';
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

function highlight(text: string, query: string): ReactNode {
  const needle = query.trim();
  if (!needle) return text;
  const lower = text.toLowerCase();
  const target = needle.toLowerCase();
  const parts: ReactNode[] = [];
  let index = 0;
  while (index < text.length) {
    const at = lower.indexOf(target, index);
    if (at < 0) {
      parts.push(text.slice(index));
      break;
    }
    if (at > index) parts.push(text.slice(index, at));
    parts.push(<mark key={at}>{text.slice(at, at + target.length)}</mark>);
    index = at + target.length;
  }
  return parts;
}

export function MemoryPage() {
  const { confirm, toast } = useSession();
  const slot = useCoreSlot<HTMLButtonElement>(true);
  const [items, setItems] = useState<MemoryItem[]>(load);
  const [query, setQuery] = useState('');
  const [sheet, setSheet] = useState<{ id: string | null; editing: boolean } | null>(null);
  const [draft, setDraft] = useState('');
  const [cat, setCat] = useState<MemoryItem['cat']>('pref');
  const [pinned, setPinned] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => !q || `${item.text} ${item.source}`.toLowerCase().includes(q));
  }, [items, query]);

  const save = (next: MemoryItem[]) => {
    setItems(next);
    localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event('aura-memories'));
  };
  useEffect(() => {
    const sync = () => setItems(load());
    window.addEventListener('aura-memories', sync);
    return () => window.removeEventListener('aura-memories', sync);
  }, []);
  const current = sheet?.id ? items.find((item) => item.id === sheet.id) : undefined;
  const openCreate = () => {
    setDraft('');
    setCat('pref');
    setPinned(false);
    setInvalid(false);
    setSheet({ id: null, editing: true });
  };
  const openView = (item: MemoryItem) => {
    setSheet({ id: item.id, editing: false });
  };
  const openEdit = (item: MemoryItem) => {
    setDraft(item.text);
    setCat(item.cat);
    setPinned(item.pinned);
    setInvalid(false);
    setSheet({ id: item.id, editing: true });
  };
  const closeSheet = () => setSheet(null);

  useEffect(() => {
    if (!sheet) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || document.querySelector('.scrim.open')) return;
      event.preventDefault();
      event.stopPropagation();
      if (sheet.editing && current) openView(current);
      else closeSheet();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [sheet, current]);

  const saveDraft = () => {
    const text = draft.trim();
    if (!text) {
      setInvalid(true);
      draftRef.current?.focus();
      return;
    }
    if (current) {
      save(items.map((item) => (item.id === current.id ? { ...item, text, cat, pinned, at: '刚刚更新' } : item)));
      toast('已更新这条记忆');
    } else {
      save([{ id: `m-${Date.now()}`, cat, text, source: '你手动添加', at: '刚刚', pinned }, ...items]);
      toast('已添加');
    }
    closeSheet();
  };

  return (
    <main className="page mem">
      <header className="mhead" data-enter="" style={{ ['--enter' as string]: 0 }}>
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
            onClick={openCreate}
          >
            <Icon name="plus" />
            添加
          </button>
        </div>
      </header>
      <div className="board scroll fade-edges" data-enter="" style={{ ['--enter' as string]: 1 }}>
        {visible.length === 0 ? (
          <EmptyState
            icon={query.trim() ? 'search-x' : 'brain'}
            title={query.trim() ? '没有匹配的记忆' : '记忆是空的'}
            actions={
              query.trim() ? undefined : (
                <button type="button" className="btn btn-secondary" onClick={openCreate}>
                  添加一条
                </button>
              )
            }
          >
            {query.trim()
              ? `没有内容或来源包含「${query.trim()}」。`
              : '添加一条你希望 AURA 以后用到的偏好。它会显示在这里，而不是藏在模型里。'}
          </EmptyState>
        ) : null}
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
                  aria-current={sheet?.id === item.id}
                  onClick={() => openView(item)}
                >
                  <Icon name="pin" className="i pin" />
                  <span className="tx">{highlight(item.text, query)}</span>
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
      <aside className={`sheet${sheet ? ' open' : ''}`} role="dialog" aria-modal="true" aria-label="记忆">
        {sheet ? (
          <>
            <div className="sheet-head">
              <h2>{sheet.editing ? (current ? '编辑记忆' : '新的记忆') : '记忆'}</h2>
              <button type="button" className="icon-btn" aria-label="关闭" onClick={closeSheet}>
                <Icon name="x" />
              </button>
            </div>
            {sheet.editing ? (
              <>
                <div className="sheet-body">
                  <label className="field">
                    <span className="lbl">内容</span>
                    <textarea
                      className="input"
                      maxLength={240}
                      aria-label="记忆内容"
                      aria-invalid={invalid}
                      ref={draftRef}
                      value={draft}
                      autoFocus
                      onChange={(event) => {
                        setDraft(event.target.value);
                        setInvalid(false);
                      }}
                    />
                    <span className="help">最多 240 字。写清楚一件事，方便以后被引用。</span>
                  </label>
                  <label className="field" style={{ marginTop: 14 }}>
                    <span className="lbl">分类</span>
                    <span className="select">
                      <select value={cat} aria-label="分类" onChange={(event) => setCat(event.target.value as MemoryItem['cat'])}>
                        {(Object.keys(MEMORY_CATS) as MemoryItem['cat'][]).map((key) => (
                          <option key={key} value={key}>
                            {MEMORY_CATS[key]}
                          </option>
                        ))}
                      </select>
                      <Icon name="chevron-down" className="i i-14" />
                    </span>
                  </label>
                  <button type="button" className="mrow" style={{ marginTop: 16 }} aria-pressed={pinned} onClick={() => setPinned((value) => !value)}>
                    <Icon name={pinned ? 'pin' : 'pin-off'} className="i pin" />
                    <span className="tx">固定这条记忆</span>
                    <span className="meta">
                      <span>固定后会优先出现在对话的上下文里</span>
                    </span>
                  </button>
                </div>
                <div className="sheet-foot">
                  <button type="button" className="btn btn-quiet" onClick={() => (current ? openView(current) : closeSheet())}>
                    取消
                  </button>
                  <span className="grow" />
                  <button type="button" className="btn btn-primary" onClick={saveDraft}>
                    保存
                  </button>
                </div>
              </>
            ) : current ? (
              <>
                <div className="sheet-body">
                  <p className="body-copy">{current.text}</p>
                  <div className="meta-grid">
                    <div>
                      <span>分类</span>
                      <b>{MEMORY_CATS[current.cat]}</b>
                    </div>
                    <div>
                      <span>来源</span>
                      <b>{current.source}</b>
                    </div>
                    <div>
                      <span>时间</span>
                      <b>{current.at}</b>
                    </div>
                    <div>
                      <span>固定</span>
                      <b>{current.pinned ? '是，会优先引用' : '否'}</b>
                    </div>
                  </div>
                </div>
                <div className="sheet-foot">
                  <button
                    type="button"
                    className="btn btn-quiet"
                    style={{ color: 'var(--danger)' }}
                    onClick={() => {
                      const snapshot = current;
                      void confirm({
                        risk: '删除后不再被引用',
                        title: '删除这条记忆？',
                        desc: snapshot.text,
                        rows: [
                          ['brain', '会删除', '这一条。它只存在这台浏览器里'],
                          ['messages-square', '不会删除', '产生它的那次演示对话'],
                        ],
                        deny: '取消',
                        allow: '删除',
                        danger: true,
                      }).then((ok) => {
                        if (!ok) return;
                        save(items.filter((item) => item.id !== snapshot.id));
                        closeSheet();
                        toast('已删除', {
                          icon: 'trash-2',
                          action: {
                            label: '撤销',
                            run: () => {
                              setItems((currentItems) => {
                                const restored = [snapshot, ...currentItems.filter((item) => item.id !== snapshot.id)];
                                localStorage.setItem(KEY, JSON.stringify(restored));
                                window.dispatchEvent(new Event('aura-memories'));
                                return restored;
                              });
                              setSheet({ id: snapshot.id, editing: false });
                            },
                          },
                        });
                      });
                    }}
                  >
                    <Icon name="trash-2" className="i i-14" />
                    删除
                  </button>
                  <span className="grow" />
                  <button type="button" className="btn btn-secondary" onClick={() => openEdit(current)}>
                    <Icon name="pencil" className="i i-14" />
                    编辑
                  </button>
                </div>
              </>
            ) : null}
          </>
        ) : null}
      </aside>
    </main>
  );
}
