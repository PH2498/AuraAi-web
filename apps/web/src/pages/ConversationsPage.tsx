import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useCoreSlot } from '../components/aura-core/CoreProvider';
import { CommandBar } from '../components/command-input/CommandBar';
import { Icon } from '../components/icon';
import { CONVERSATIONS } from '../fixtures/content';

export function ConversationsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState('');
  const current =
    id === 'new' ? undefined : CONVERSATIONS.find((item) => item.id === id) ?? (id ? undefined : CONVERSATIONS[0]);
  const fresh = !current;
  const selectedId = current?.id;
  const slot = useCoreSlot<HTMLButtonElement>(true);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CONVERSATIONS.filter((item) => !q || `${item.title} ${item.excerpt}`.toLowerCase().includes(q));
  }, [query]);

  return (
    <main className="page conv">
      <aside className="index" aria-label="会话">
        <div className="index-head">
          <h1>
            对话<span className="n">{CONVERSATIONS.length}</span>
          </h1>
          <button type="button" className="icon-btn icon-btn-sm" aria-label="新对话" onClick={() => navigate('/conversations/new')}>
            <Icon name="square-pen" />
          </button>
        </div>
        <div className="search">
          <Icon name="search" />
          <input className="input" value={query} placeholder="搜索标题和内容" aria-label="搜索会话" onChange={(event) => setQuery(event.target.value)} />
        </div>
        <div className="sessions scroll fade-edges">
          <h3>演示</h3>
          {visible.length === 0 ? <p className="empty-state">没有匹配的演示会话。</p> : null}
          {visible.map((item) => (
            <Link key={item.id} className="srow" to={`/conversations/${item.id}`} aria-current={item.id === selectedId ? true : undefined}>
              <Icon name={item.icon} />
              <span className="t">{item.title}</span>
              <time>{item.when}</time>
              <span className="x">{item.excerpt}</span>
            </Link>
          ))}
        </div>
      </aside>
      <section className={`main${fresh ? ' is-new' : ''}`} aria-label="会话内容">
        {fresh ? (
          <div className="fresh">
            <button ref={slot} className="core-slot" type="button" aria-label="与 AURA 语音对话" />
            <h2>新对话</h2>
            <p>说出来，或者在下面输入。模型尚未接入，发送后只会留下一条演示说明。</p>
          </div>
        ) : (
          <>
            <div className="col chead-wrap">
              <header className="chead">
                <button ref={slot} className="core-slot" type="button" aria-label="与 AURA 语音对话" />
                <div className="ttl">
                  <h2>{current.title}</h2>
                  <div className="meta">演示会话 · 模型未接入</div>
                </div>
              </header>
            </div>
            <div className="stream">
              <div className="col">
                <p className="ask">{current.ask}</p>
                <div className="answer">
                  {current.answer.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
                {note ? <p className="answer">{note}</p> : null}
              </div>
            </div>
          </>
        )}
        <div className="col composer">
          <CommandBar
            value={draft}
            onChange={setDraft}
            onSubmit={() => {
              setNote('这是演示回复。模型还没有接入，这条内容没有发给任何服务。');
              setDraft('');
            }}
          />
        </div>
      </section>
      <aside className="ctx" aria-label="这次对话用到的上下文">
        <div className="ctx-head">
          <h2>这次用到的</h2>
        </div>
        <div>
          <p className="empty-state">演示会话没有真实画面、工具或记忆。</p>
        </div>
      </aside>
    </main>
  );
}
