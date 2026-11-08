import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../app/session';
import { useCorePointer, useCoreSlot } from '../components/aura-core/CoreProvider';
import { CommandBar } from '../components/command-input/CommandBar';
import { Icon } from '../components/icon';
import { CONVERSATIONS, SUGGESTIONS } from '../fixtures/content';
import { MODELS, STATE_LABEL } from '../state/settings';

function greeting() {
  const hour = new Date().getHours();
  if (hour < 5) return '夜深了';
  if (hour < 11) return '早上好';
  if (hour < 13) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

export function HomePage() {
  const { aura, setAura, sensing, toggleSensor, settings, ollamaReady, drawerOpen, setDrawerOpen, toast } = useSession();
  const [draft, setDraft] = useState('');
  const [reading, setReading] = useState<{ ask: string; answer: string; at: string; when: string; settled: boolean } | null>(null);
  const [focused, setFocused] = useState(false);
  const [sessionQuery, setSessionQuery] = useState('');
  const slot = useCoreSlot<HTMLButtonElement>(true);
  const pointer = useCorePointer(() => void toggleSensor('mic'));

  const suggesting = focused && !draft && !reading;
  useEffect(() => {
    document.body.classList.toggle('reading', Boolean(reading));
    document.body.classList.toggle('suggesting', suggesting);
    return () => {
      document.body.classList.remove('reading', 'suggesting');
    };
  }, [reading, suggesting]);
  useEffect(() => {
    const clear = () => setReading(null);
    document.addEventListener('aura-new-chat', clear);
    return () => document.removeEventListener('aura-new-chat', clear);
  }, []);
  useEffect(() => {
    if (!drawerOpen) return;
    const field = document.getElementById('sessionSearch');
    const timer = window.setTimeout(() => field?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, [drawerOpen]);
  const sessions = CONVERSATIONS.filter((item) => {
    const q = sessionQuery.trim();
    return !q || item.title.includes(q) || item.excerpt.includes(q);
  });

  const submit = (text: string) => {
    const ask = text.trim();
    if (!ask) return;
    setDraft('');
    const now = new Date();
    setReading({
      ask,
      answer: '这是演示回复。模型还没有接入，所以我不会假装已经完成这件事。',
      at: now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      when: now.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }),
      settled: false,
    });
    setAura('thinking');
    window.setTimeout(() => {
      setAura('idle');
      setReading((current) => (current && current.ask === ask ? { ...current, settled: true } : current));
    }, 900);
  };

  return (
    <main className="home">
      <section className="presence">
        <div className="core-anchor">
          <button
            ref={slot}
            className="core-hit"
            type="button"
            aria-label="与 AURA 语音对话（⌥ Space）"
            {...pointer}
          />
          <span className="core-hint" aria-hidden="true">
            <span>
              <b>点击</b> 开始语音
            </span>
            <span className="sep" />
            <span>
              <b>拖动</b> 旋转核心
            </span>
          </span>
        </div>
        <div className="greeting">
          <p className="state-eyebrow">
            <span className="dot" />
            <span>{STATE_LABEL[aura]}</span>
          </p>
          <h1>{greeting()}</h1>
          <p className="status">我在。说出来，或者在下面输入你想做的事。</p>
        </div>
      </section>

      <section className="reply" aria-label="本次会话">
        {reading ? (
          <>
            <div className="reply-head">
              <span className="meta">
                本次会话 · {reading.when} · {reading.settled ? STATE_LABEL.idle : STATE_LABEL.thinking}
              </span>
              <button type="button" className="btn btn-sm btn-quiet" onClick={() => setReading(null)}>
                <Icon name="square-pen" className="i i-14" />
                新对话
              </button>
            </div>
            <article className="turn">
              <p className="who">你 · {reading.at}</p>
              <p className="ask">{reading.ask}</p>
              <div className="answer-wrap">
                <div className="who">
                  <svg className="mark" viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="12" r="3.6" fill="currentColor" />
                    <ellipse
                      cx="12"
                      cy="12"
                      rx="10"
                      ry="4.4"
                      transform="rotate(-28 12 12)"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    />
                  </svg>
                  AURA · {MODELS[settings.model].name}
                </div>
                <details className="activity" open={!reading.settled}>
                  <summary>
                    <Icon name={reading.settled ? 'circle-check' : 'loader-circle'} className="i i-14" />
                    <span className="sum">{reading.settled ? '演示回复 · 模型未接入' : '正在写演示回复'}</span>
                    <Icon name="chevron-right" className="i i-14 chev" />
                  </summary>
                  <ol>
                    <li data-s={reading.settled ? 'done' : 'active'}>
                      <Icon name={reading.settled ? 'circle-check' : 'loader-circle'} className="i i-14" />
                      <div>
                        写下演示说明
                        <div className="d">没有发给任何模型</div>
                      </div>
                      <span className="t">{reading.settled ? '完成' : ''}</span>
                    </li>
                  </ol>
                </details>
                <div className={`answer${reading.settled ? '' : ' streaming'}`}>
                  <p>{reading.answer}</p>
                </div>
                <div className={`answer-actions${reading.settled ? ' show' : ''}`}>
                  <button
                    type="button"
                    className="icon-btn icon-btn-sm"
                    aria-label="复制演示回复"
                    onClick={() => {
                      void navigator.clipboard.writeText(reading.answer).then(
                        () => toast('已复制演示回复'),
                        () => toast('复制失败：剪贴板不可用'),
                      );
                    }}
                  >
                    <Icon name="copy" />
                  </button>
                </div>
              </div>
            </article>
          </>
        ) : null}
      </section>

      <section className="dock">
        <div onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}>
          <CommandBar value={draft} onChange={setDraft} onSubmit={() => submit(draft)} />
        </div>
        <div className="dock-foot">
          <div className="foot-row" id="recentRow">
            <span className="lead">继续</span>
            {CONVERSATIONS.slice(0, 2).map((item) => (
              <Link key={item.id} to={`/conversations/${item.id}`}>
                <Icon name={item.icon} className="i i-14" />
                <span>{item.title}</span>
                <span className="when">{item.when}</span>
              </Link>
            ))}
          </div>
          <div className="foot-row" id="suggestRow">
            <span className="lead">试试</span>
            {SUGGESTIONS.map(([icon, text]) => (
              <button key={text} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => submit(text)}>
                <Icon name={icon} className="i i-14" />
                <span>{text}</span>
              </button>
            ))}
          </div>
          <p className="hint warn">
            <Icon name="triangle-alert" className="i i-14" />
            <span>演示界面 · 模型尚未接入</span>
          </p>
        </div>
      </section>

      <aside className="hud hud-bl" aria-label="感知状态">
        <div className="row">
          <span>感知</span>
          <span className="tick" />
        </div>
        <span className="sensor sense-mic" data-on={sensing.mic}>
          <Icon name="mic" />
          <span>麦克风 {sensing.mic ? '开启' : '未开启'}</span>
        </span>
        <span className="sensor sense-cam" data-on={sensing.cam}>
          <Icon name="camera" />
          <span>摄像头 {sensing.cam ? '开启' : '未开启'}</span>
        </span>
        <span className="sensor sense" data-on={sensing.screen}>
          <Icon name="monitor" />
          <span>屏幕 {sensing.screen ? '已共享' : '未共享'}</span>
        </span>
      </aside>
      <aside className="hud hud-br" aria-label="运行状态">
        <div className="row">
          <span className="tick" />
          <span>运行</span>
        </div>
        <span className="v">
          {ollamaReady && settings.model === 'local' ? `${MODELS.local.name} · 已连接` : `${MODELS[settings.model].name} · 未配置`}
        </span>
        <span>未接入模型</span>
      </aside>

      <aside className={`drawer${drawerOpen ? ' open' : ''}`} id="drawer" aria-label="会话">
        <div className="drawer-head">
          <h2>会话</h2>
          <button type="button" className="icon-btn icon-btn-sm" aria-label="关闭会话列表" onClick={() => setDrawerOpen(false)}>
            <Icon name="x" />
          </button>
        </div>
        <div className="search">
          <Icon name="search" />
          <input
            id="sessionSearch"
            className="input"
            value={sessionQuery}
            placeholder="搜索会话"
            aria-label="搜索会话"
            onChange={(event) => setSessionQuery(event.target.value)}
          />
        </div>
        <div className="sessions">
          {sessions.length === 0 ? <p className="empty">没有找到包含「{sessionQuery.trim()}」的会话</p> : <h3>演示</h3>}
          {sessions.map((item) => (
            <Link key={item.id} className="session" to={`/conversations/${item.id}`} onClick={() => setDrawerOpen(false)}>
              <Icon name={item.icon} />
              <span>{item.title}</span>
              <time>{item.when}</time>
            </Link>
          ))}
        </div>
      </aside>
    </main>
  );
}
