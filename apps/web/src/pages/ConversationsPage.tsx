import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useSession } from '../app/session';
import { useCore, useCorePointer, useCoreSlot } from '../components/aura-core/CoreProvider';
import { CommandBar } from '../components/command-input/CommandBar';
import { savedShot, ShotList } from '../components/shot-list';
import { Markdown } from '../components/MarkdownView';
import { Icon } from '../components/icon';
import { CONVERSATIONS } from '../fixtures/content';
import { deleteConversation, ensureOllama, listConversations, listMessages, renameConversation, streamReply, type MessageAttachment, type ServerConversation, type ServerMessage } from '../chat/api';
import type { ChatAttachment } from '../chat/attachments';
import { prepareSend } from '../chat/prepare';
import { createMemory } from '../memory/api';
import { fetchSpeech } from '../vision/api';
import { playWav, stopSpeech, unlockSpeech } from '../vision/playback';
import { describeChoice } from '../state/models';

const FRESH_SUGGESTIONS: [string, string][] = [
  ['monitor', '总结我屏幕上的内容'],
  ['bell', '明天下午三点提醒我和设计团队复盘'],
  ['code', '写一个 Electron 的全局快捷键示例'],
];

type Thread = Omit<(typeof CONVERSATIONS)[number], 'id'> & {
  id: string;
  pinned: boolean;
  modelName?: string | null;
  modelProvider?: string | null;
};

function asThread(item: ServerConversation): Thread {
  return {
    id: item.id,
    title: item.title,
    when: new Date(item.updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    group: '记录',
    icon: 'messages-square',
    excerpt: item.modelName ?? '已保存的对话',
    ask: item.title,
    answer: [],
    pinned: false,
    modelName: item.modelName,
    modelProvider: item.modelProvider,
  };
}

function savedModel(thread: Thread): { where: '本机' | '云端'; name: string } | null {
  if (thread.modelProvider === 'ollama') return { where: '本机', name: thread.modelName || 'Ollama' };
  if (thread.modelProvider === 'openai') return { where: '云端', name: thread.modelName || '云端接口' };
  return null;
}

function threadTurns(history: ServerMessage[]): { key: string; ask: string; answer: string; streaming: boolean; shots: MessageAttachment[] }[] {
  const turns: { key: string; ask: string; answer: string; streaming: boolean; shots: MessageAttachment[] }[] = [];
  for (const item of history) {
    if (item.role === 'user') {
      turns.push({ key: item.id, ask: item.content.display || item.content.text, answer: '', streaming: false, shots: (item.content.attachments ?? []).map(savedShot) });
      continue;
    }
    if (item.role !== 'assistant') continue;
    const last = turns.at(-1);
    if (!last || last.answer) {
      turns.push({ key: item.id, ask: '', answer: item.content.text, streaming: item.status === 'streaming', shots: [] });
      continue;
    }
    last.answer = item.content.text;
    last.streaming = item.status === 'streaming';
  }
  return turns;
}

export function ConversationsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { conversation, contextExpanded, toggleConversationContext, closeConversationPopovers, confirm, toast, account, requireAccount, settings, ollamaModels, endpoints, noteCloudProbe, setAura, toggleDictation } = useSession();
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState('');
  const [overlay, setOverlay] = useState<Record<string, { title?: string; pinned?: boolean; hidden?: boolean }>>({});
  const [locals, setLocals] = useState<Thread[]>([]);
  const [remote, setRemote] = useState<Thread[]>([]);
  const [history, setHistory] = useState<ServerMessage[]>([]);
  const [usedMemory, setUsedMemory] = useState<{ id: string; content: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const stopRef = useRef<AbortController | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const skipRename = useRef(false);
  const slot = useCoreSlot<HTMLButtonElement>(true);
  const pointer = useCorePointer(() => toggleDictation());
  const core = useCore();

  const library = useMemo<Thread[]>(() => {
    const fixtures = CONVERSATIONS.filter((item) => !overlay[item.id]?.hidden).map((item) => ({
      ...item,
      title: overlay[item.id]?.title ?? item.title,
      pinned: overlay[item.id]?.pinned ?? false,
    }));
    return [...remote, ...locals, ...fixtures].sort((a, b) => Number(b.pinned) - Number(a.pinned));
  }, [locals, overlay, remote]);

  const found = id && id !== 'new' ? library.find((item) => item.id === id) : undefined;
  const pendingLive = Boolean(id && id !== 'new' && !found && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id));
  const current =
    id === 'new'
      ? undefined
      : found ??
        (pendingLive && id
          ? {
              id,
              title: '新对话',
              when: '刚刚',
              group: '记录',
              icon: 'messages-square',
              excerpt: '正在生成',
              ask: '',
              answer: [],
              pinned: false,
            }
          : id
            ? undefined
            : library[0]);
  const fresh = !current;
  const selectedId = current?.id;
  const live = Boolean(current && (pendingLive || remote.some((item) => item.id === current.id)));
  const model = current ? savedModel(current) : null;
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return library.filter((item) => !q || `${item.title} ${item.excerpt}`.toLowerCase().includes(q));
  }, [library, query]);

  useEffect(() => {
    if (!account) {
      setRemote([]);
      return;
    }
    void listConversations()
      .then((rows) =>
        setRemote(rows.map(asThread)),
      )
      .catch(() => setRemote([]));
  }, [account, busy]);

  useEffect(() => {
    if (!live) {
      setUsedMemory([]);
      return;
    }
    const seen = new Set<string>();
    const cited: { id: string; content: string }[] = [];
    for (const message of history) {
      for (const memory of message.content.memories ?? []) {
        if (seen.has(memory.id)) continue;
        seen.add(memory.id);
        cited.push(memory);
      }
    }
    setUsedMemory(cited);
  }, [live, history]);

  useEffect(() => {
    if (busy) return;
    if (!live || !selectedId) {
      setHistory([]);
      return;
    }
    void listMessages(selectedId).then(setHistory).catch(() => setHistory([]));
  }, [live, selectedId, busy]);

  useEffect(() => {
    document.body.classList.toggle('idx-open', conversation.indexOpen);
    document.body.classList.toggle('idx-collapsed', conversation.collapsed);
    document.body.classList.toggle('ctx-open', conversation.contextOpen);
    document.body.classList.toggle('ctx-hidden', conversation.contextHidden);
    return () => {
      document.body.classList.remove('idx-open', 'idx-collapsed', 'ctx-open', 'ctx-hidden');
    };
  }, [conversation]);

  useEffect(() => {
    if (!conversation.indexOpen) return;
    const timer = window.setTimeout(() => document.getElementById('conversation-search')?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, [conversation.indexOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.more-menu, [aria-label="更多"]')) return;
      setMenuOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [menuOpen]);

  const patch = (threadId: string, next: { title?: string; pinned?: boolean; hidden?: boolean }) => {
    if (threadId.startsWith('local-')) {
      setLocals((items) => items.map((item) => (item.id === threadId ? { ...item, ...next } : item)));
      return;
    }
    setOverlay((items) => ({ ...items, [threadId]: { ...items[threadId], ...next } }));
  };

  const reloadRemote = () => {
    if (!account) return;
    void listConversations()
      .then((rows) => setRemote(rows.map(asThread)))
      .catch(() => undefined);
  };

  const submit = (text: string, speakAfter = false, attachments: ChatAttachment[] = []): Promise<boolean> => {
    const typed = text.trim();
    if (busy) return Promise.resolve(false);
    if (!fresh && !live) {
      if (!typed && attachments.length === 0) return Promise.resolve(false);
      setDraft('');
      setNote('这是演示回复。模型还没有接入，这条内容没有发给任何服务。');
      return Promise.resolve(true);
    }
    return (async () => {
      if (!(await requireAccount())) return false;
      const prepared = await prepareSend(typed, attachments, settings, ollamaModels, endpoints).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : '这一帧没有附上';
        toast(message, { icon: 'circle-alert' });
        return { ok: false as const, message: undefined };
      });
      if (!prepared.ok) {
        if (prepared.message) setNote(prepared.message);
        return false;
      }
      const { send } = prepared;
      const target = send.target;
      const cloud = target.cloud;
      const model = target.model;
      setDraft('');
      const controller = new AbortController();
      stopRef.current = controller;
      setBusy(true);
      setAura('thinking');
      core.setTicks(2, 0);
      const userMessage: ServerMessage = {
        id: `pending-${Date.now()}`,
        role: 'user',
        content: { text: send.message, display: send.display, attachments: send.shots },
        sequence: history.length + 1,
        status: 'complete',
      };
      const assistant: ServerMessage = {
        id: 'pending-assistant',
        role: 'assistant',
        content: { text: '' },
        sequence: history.length + 2,
        status: 'streaming',
      };
      setHistory((items) => [...items.filter((item) => item.id !== 'pending-assistant'), userMessage, assistant]);
      let answer = '';
      let frame = 0;
      const paint = () => {
        frame = 0;
        setHistory((items) => items.map((item) => (item.id === 'pending-assistant' || item.status === 'streaming' ? { ...item, content: { text: answer } } : item)));
      };
      try {
        if (!cloud) await ensureOllama(settings.ollamaUrl, model);
        core.setTicks(2, 1);
        await streamReply(
          {
            message: send.message,
            display: send.display,
            conversationId: live ? selectedId : undefined,
            provider: target.provider,
            providerId: target.providerId,
            model,
            images: send.images,
            attachments: send.attachments,
          },
          {
            signal: controller.signal,
            onStart: (event) => {
              setAura('speaking');
              core.setTicks(2, 2);
              if (!live) navigate(`/conversations/${event.conversationId}`);
            },
            onDelta: (chunk) => {
              answer += chunk;
              core.setAmplitude(0.25 + Math.min(0.7, chunk.length / 24));
              if (!frame) frame = window.requestAnimationFrame(paint);
            },
          },
        );
        if (frame) window.cancelAnimationFrame(frame);
        paint();
        if (target.providerId) noteCloudProbe(target.providerId, 'ok');
        setAura('idle');
        if (speakAfter && answer.trim()) {
          stopSpeech();
          setAura('speaking');
          void fetchSpeech(answer, settings.rate || 1)
            .then((bytes) => playWav(bytes))
            .then(() => setAura('idle'))
            .catch(() => setAura('idle'));
        }
        if (settings.memoryAuto && /记住|以后|我喜欢|我习惯/.test(typed)) {
          void createMemory({ content: typed.slice(0, 240), category: 'learned', sourceType: 'conversation', title: typed.slice(0, 40) }).then(
            () => toast('已放进待确认。确认前不会用于对话。'),
            () => undefined,
          );
        }
        reloadRemote();
        if (live && selectedId) {
          const saved = await listMessages(selectedId);
          setHistory(saved);
        }
      } catch (error) {
        if (frame) window.cancelAnimationFrame(frame);
        const message = controller.signal.aborted ? answer || '已停止生成' : error instanceof Error ? error.message : '模型服务暂时不可用';
        setHistory((items) => items.map((item) => (item.role === 'assistant' && !item.content.text ? { ...item, content: { text: message }, status: 'error' } : item)));
        setAura(controller.signal.aborted ? 'idle' : 'error');
        if (!controller.signal.aborted) {
          if (target.providerId) noteCloudProbe(target.providerId, 'fail');
          toast(message, { icon: 'circle-alert' });
        }
      } finally {
        stopRef.current = null;
        setBusy(false);
        core.setAmplitude(0);
        core.setTicks(0, 0);
      }
      return true;
    })();
  };

  const contextButton = (
    <button
      type="button"
      className="icon-btn icon-btn-sm"
      aria-label="上下文"
      aria-expanded={contextExpanded}
      data-tip="这次用到的上下文"
      data-tip-pos="bottom"
      onClick={toggleConversationContext}
    >
      <Icon name="layers" />
    </button>
  );

  return (
    <main className="page conv">
      <aside className="index" id="conversation-index" aria-label="会话" data-enter="" style={{ ['--enter' as string]: 0 }}>
        <div className="index-head">
          <h1>
            对话<span className="n">{library.length}</span>
          </h1>
          <button
            type="button"
            className="icon-btn icon-btn-sm"
            aria-label="新对话"
            data-tip="新对话 ⌘N"
            data-tip-pos="bottom"
            onClick={() => navigate('/conversations/new')}
          >
            <Icon name="square-pen" />
          </button>
        </div>
        <div className="search">
          <Icon name="search" />
          <input
            id="conversation-search"
            className="input"
            value={query}
            placeholder="搜索标题和内容"
            aria-label="搜索会话"
            onChange={(event) => setQuery(event.target.value)}
          />
          <button type="button" className="icon-btn icon-btn-sm clear" aria-label="清除搜索" hidden={!query} onClick={() => setQuery('')}>
            <Icon name="x" className="i i-14" />
          </button>
        </div>
        <div className="sessions scroll fade-edges">
          {visible.length === 0 ? (
            <div className="empty-state">
              <span className="glyph">
                <Icon name="search-x" className="i i-20" />
              </span>
              <h3>{`没有找到「${query.trim()}」`}</h3>
              <p>标题和内容里都没有匹配。换个关键词，或者直接问 AURA。</p>
              <div className="acts">
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => setQuery('')}>
                  清除搜索
                </button>
              </div>
            </div>
          ) : null}
          {visible.some((item) => item.group === '记录') ? <h3>记录</h3> : null}
          {visible
            .filter((item) => item.group === '记录')
            .map((item) => (
            <Link
              key={item.id}
              className="srow"
              to={`/conversations/${item.id}`}
              aria-current={item.id === selectedId ? true : undefined}
              onClick={() => {
                if (window.innerWidth < 1120) closeConversationPopovers();
              }}
            >
              <Icon name={item.pinned ? 'pin' : item.icon} />
              <span className="t">{item.title}</span>
              <time>{item.when}</time>
              <span className="x">{item.excerpt}</span>
            </Link>
          ))}
          {visible.some((item) => item.group !== '记录') ? <h3>演示</h3> : null}
          {visible
            .filter((item) => item.group !== '记录')
            .map((item) => (
            <Link
              key={item.id}
              className="srow"
              to={`/conversations/${item.id}`}
              aria-current={item.id === selectedId ? true : undefined}
              onClick={() => {
                if (window.innerWidth < 1120) closeConversationPopovers();
              }}
            >
              <Icon name={item.pinned ? 'pin' : item.icon} />
              <span className="t">{item.title}</span>
              <time>{item.when}</time>
              <span className="x">{item.excerpt}</span>
            </Link>
          ))}
        </div>
      </aside>
      <section className={`main${fresh ? ' is-new' : ''}`} aria-label="会话内容" data-enter="" style={{ ['--enter' as string]: 1 }}>
        {fresh ? (
          <div className="fresh">
            <button ref={slot} {...pointer} className="core-slot" type="button" aria-label="与 AURA 语音对话" />
            <h2>新对话</h2>
            <p>说出来，或者在下面输入。本机 Ollama 连通后，发送会得到真实回复并保存。</p>
            <div className="sugs">
              {FRESH_SUGGESTIONS.map(([icon, text]) => (
                <button key={text} type="button" onClick={() => submit(text)}>
                  <Icon name={icon} className="i i-14" />
                  {text}
                </button>
              ))}
            </div>
            {contextButton}
          </div>
        ) : (
          <>
            <div className="col chead-wrap">
              <header className="chead">
                <button ref={slot} {...pointer} className="core-slot" type="button" aria-label="与 AURA 语音对话" />
                <div className="ttl">
                  {renaming ? (
                    <input
                      className="input rename"
                      aria-label="会话名称"
                      maxLength={60}
                      value={renameDraft}
                      autoFocus
                      onChange={(event) => setRenameDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                          event.stopPropagation();
                          skipRename.current = true;
                          setRenaming(false);
                        }
                        if (event.key === 'Enter') event.currentTarget.blur();
                      }}
                      onBlur={() => {
                        if (skipRename.current) {
                          skipRename.current = false;
                          setRenaming(false);
                          return;
                        }
                        const title = renameDraft.trim();
                        if (!title) toast('名称不能为空', { icon: 'circle-alert' });
                        else if (title !== current.title) {
                          patch(current.id, { title });
                          if (live) {
                            void renameConversation(current.id, title).catch((error: unknown) => {
                              toast(error instanceof Error ? error.message : '重命名没有完成', { icon: 'circle-alert' });
                            });
                          }
                          toast('已重命名');
                        }
                        setRenaming(false);
                      }}
                    />
                  ) : (
                    <h2>{current.title}</h2>
                  )}
                  <div className="meta">{live ? (model ? `${model.where} · ${model.name}` : '已保存的对话') : '演示会话 · 模型未接入'}</div>
                </div>
                <div className="acts">
                  <button
                    type="button"
                    className="icon-btn icon-btn-sm"
                    aria-label={current.pinned ? '取消固定' : '固定'}
                    aria-pressed={current.pinned}
                    data-tip={current.pinned ? '取消固定' : '固定'}
                    data-tip-pos="bottom"
                    onClick={() => {
                      patch(current.id, { pinned: !current.pinned });
                      toast(current.pinned ? '已取消固定' : '已固定到顶部', { icon: current.pinned ? 'pin-off' : 'pin' });
                    }}
                  >
                    <Icon name={current.pinned ? 'pin-off' : 'pin'} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn icon-btn-sm"
                    aria-label="重命名"
                    data-tip="重命名"
                    data-tip-pos="bottom"
                    onClick={() => {
                      setRenameDraft(current.title);
                      setRenaming(true);
                      setMenuOpen(false);
                    }}
                  >
                    <Icon name="pencil" />
                  </button>
                  {contextButton}
                  <button
                    type="button"
                    className="icon-btn icon-btn-sm"
                    aria-label="更多"
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    onClick={() => setMenuOpen((open) => !open)}
                  >
                    <Icon name="ellipsis" />
                  </button>
                </div>
              </header>
              <div className={`menu more-menu${menuOpen ? ' open' : ''}`} role="menu" aria-label="会话操作">
                <button
                  type="button"
                  className="menu-item"
                  role="menuitem"
                  onClick={() => {
                    const body = live
                      ? threadTurns(history)
                          .map((turn) => `**你**：${turn.ask}\n\n**AURA**：${turn.answer}`)
                          .join('\n\n')
                      : `**你**：${current.ask}\n\n**AURA**：${[...current.answer, note].filter(Boolean).join('\n\n')}`;
                    const markdown = `# ${current.title}\n\n${body}`;
                    void navigator.clipboard.writeText(markdown).then(
                      () => toast('已复制为 Markdown'),
                      () => toast('复制失败：剪贴板不可用', { icon: 'circle-alert' }),
                    );
                    setMenuOpen(false);
                  }}
                >
                  <Icon name="copy" />
                  <span>复制为 Markdown</span>
                </button>
                <button
                  type="button"
                  className="menu-item"
                  role="menuitem"
                  onClick={() => {
                    patch(current.id, { pinned: !current.pinned });
                    toast(current.pinned ? '已取消固定' : '已固定到顶部', { icon: current.pinned ? 'pin-off' : 'pin' });
                    setMenuOpen(false);
                  }}
                >
                  <Icon name="pin" />
                  <span>{current.pinned ? '取消固定' : '固定到顶部'}</span>
                </button>
                <hr />
                <button
                  type="button"
                  className="menu-item"
                  role="menuitem"
                  style={{ color: 'var(--danger)' }}
                  onClick={() => {
                    const thread = current;
                    setMenuOpen(false);
                    void confirm({
                      risk: live ? '会从你的账号里删除这次对话' : '删除后无法在 AURA 里找回',
                      title: `删除会话「${thread.title}」？`,
                      rows: live
                        ? [
                            ['messages-square', '会删除', '这条已保存的对话和消息'],
                            ['brain', '不会删除', '记忆页里的演示条目'],
                          ]
                        : [
                            ['messages-square', '会删除', '这次演示会话在列表里的位置'],
                            ['brain', '不会删除', '记忆页里的演示条目'],
                            ['list-checks', '不会删除', '任务页里的演示记录'],
                          ],
                      deny: '取消',
                      allow: '删除会话',
                      danger: true,
                    }).then((ok) => {
                      if (!ok) return;
                      const local = thread.id.startsWith('local-');
                      const saved = remote.some((item) => item.id === thread.id);
                      if (local) setLocals((items) => items.filter((item) => item.id !== thread.id));
                      else if (!saved) patch(thread.id, { hidden: true });
                      const next = library.find((item) => item.id !== thread.id);
                      navigate(next ? `/conversations/${next.id}` : '/conversations/new');
                      if (saved) {
                        void deleteConversation(thread.id)
                          .then(() => setRemote((items) => items.filter((item) => item.id !== thread.id)))
                          .catch((error: unknown) => toast(error instanceof Error ? error.message : '删除没有完成', { icon: 'circle-alert' }));
                        toast('已删除会话', { icon: 'trash-2' });
                        return;
                      }
                      toast('已删除会话', {
                        icon: 'trash-2',
                        action: {
                          label: '撤销',
                          run: () => {
                            if (local) setLocals((items) => [thread, ...items.filter((item) => item.id !== thread.id)]);
                            else patch(thread.id, { hidden: false });
                            navigate(`/conversations/${thread.id}`);
                          },
                        },
                      });
                    });
                  }}
                >
                  <Icon name="trash-2" />
                  <span>删除会话…</span>
                </button>
              </div>
            </div>
            <div className="stream">
              <div className="col">
                {(live ? threadTurns(history) : [{ key: current.id, ask: current.ask, answer: current.answer.join('\n\n'), streaming: false, shots: [] as MessageAttachment[] }]).map((turn, index, turns) => (
                  <article className="ex chat-turn" key={turn.key}>
                    {turn.ask || turn.shots.length ? (
                      <div className="chat-user">
                        {turn.shots.length ? <ShotList shots={turn.shots} /> : null}
                        {turn.ask ? <p className="chat-bubble">{turn.ask}</p> : null}
                      </div>
                    ) : null}
                    <div className="chat-ai">
                      <img className="chat-avatar" src="/logo/aura-app-icon.svg" alt="" />
                      <div className="chat-name">AURA</div>
                      <div className="chat-body">
                    <div className={`answer${turn.streaming ? ' streaming' : ''}`}>
                      <Markdown text={turn.answer} />
                      {note && !live && index === turns.length - 1 ? <p>{note}</p> : null}
                    </div>
                    <div className="answer-actions">
                      <button
                        type="button"
                        className="icon-btn icon-btn-sm"
                        aria-label="复制"
                        data-tip="复制"
                        onClick={() => {
                          const text = [turn.answer, !live && index === turns.length - 1 ? note : ''].filter(Boolean).join('\n\n');
                          void navigator.clipboard.writeText(text).then(
                            () => toast('已复制'),
                            () => toast('复制失败：剪贴板不可用', { icon: 'circle-alert' }),
                          );
                        }}
                      >
                        <Icon name="copy" />
                      </button>
                      {!live && index === turns.length - 1 ? (
                        <button
                          type="button"
                          className="icon-btn icon-btn-sm"
                          aria-label="重新生成"
                          data-tip="重新生成"
                          onClick={() => setNote('这是演示回复。模型还没有接入，这条内容没有发给任何服务。')}
                        >
                          <Icon name="rotate-ccw" />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="icon-btn icon-btn-sm"
                        aria-label="朗读"
                        data-tip="朗读"
                        onClick={() => {
                          const text = turn.answer.trim();
                          if (!text) return;
                          unlockSpeech();
                          stopSpeech();
                          setAura('speaking');
                          void fetchSpeech(text, settings.rate || 1)
                            .then((bytes) => playWav(bytes))
                            .then(() => setAura('idle'))
                            .catch(() => {
                              toast('这一句没有读出来', { icon: 'circle-alert' });
                              setAura('idle');
                            });
                        }}
                      >
                        <Icon name="volume-2" />
                      </button>
                      <span className="grow" />
                      <span className="meta">{live ? describeChoice(settings.chatModel, endpoints).name : '未接入 · 演示'}</span>
                    </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </>
        )}
        <div className="col composer">
          <CommandBar
            value={draft}
            onChange={setDraft}
            busy={busy}
            onStop={() => stopRef.current?.abort()}
            onSubmit={(items) => submit(draft, settings.autoRead, items)}
          />
        </div>
      </section>
      <aside className="ctx" aria-label="这次对话用到的上下文" data-enter="" style={{ ['--enter' as string]: 2 }}>
        <div className="ctx-head">
          <h2>这次用到的</h2>
          <button type="button" className="icon-btn icon-btn-sm ctx-close" aria-label="关闭上下文" onClick={toggleConversationContext}>
            <Icon name="x" />
          </button>
        </div>
        {fresh ? (
          <p className="none">新对话开始后，这里会列出用到的画面、附件和记忆。</p>
        ) : (
          <>
            <section>
              <h3>画面与附件</h3>
              {live && history.some((item) => item.content.attachments?.length) ? (
                history.flatMap((item) => item.content.attachments ?? []).map((item, index) => (
                  <div className="line" key={`${item.name}-${index}`}>
                    <Icon name={item.type === 'image' ? 'scan-eye' : 'file'} />
                    <span>{item.name} · 保存在这次对话里</span>
                  </div>
                ))
              ) : (
                <p className="none">{live ? '没有用到画面或附件' : '演示会话没有画面或附件'}</p>
              )}
            </section>
            <section>
              <h3>工具</h3>
              <p className="none">没有调用工具</p>
            </section>
            <section>
              <h3>引用的记忆</h3>
              {live && usedMemory.length ? (
                usedMemory.map((item) => (
                  <div className="line memory" key={item.id}>
                    <Icon name="brain" />
                    <span>{item.content}</span>
                  </div>
                ))
              ) : (
                <p className="none">{live ? '这次没有用到记忆' : '演示会话没有读取记忆'}</p>
              )}
            </section>
            <section>
              <h3>隐私</h3>
              <p className="privacy">
                <Icon name="shield-check" className="i i-14" />
                <span>
                  {live
                    ? `这次对话发给${model ? `${model.where}的 ${model.name}` : `${describeChoice(settings.chatModel, endpoints).where === '本地' ? '本机' : describeChoice(settings.chatModel, endpoints).where}的 ${describeChoice(settings.chatModel, endpoints).name}`}，并保存在你的账号里。${history.some((item) => item.content.attachments?.some((shot) => shot.type === 'image')) ? '画面只发给能看图的模型，原图也留在这次对话里。' : ''}没有调用工具，${usedMemory.length ? `读了 ${usedMemory.length} 条已确认的记忆` : '没有读取记忆'}。`
                    : '这次是演示会话，内容没有发给模型。'}
                </span>
              </p>
            </section>
          </>
        )}
      </aside>
    </main>
  );
}
