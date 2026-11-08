import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useSession } from '../../app/session';
import { resolvedOs } from '../../state/settings';
import { CoreProvider } from '../aura-core/CoreProvider';
import { Icon, WordmarkGlyph } from '../icon';

const NAV = [
  { to: '/', page: 'home', icon: 'house', label: '主页' },
  { to: '/conversations', page: 'conversations', icon: 'messages-square', label: '对话' },
  { to: '/vision', page: 'vision', icon: 'scan-eye', label: '视觉' },
  { to: '/tasks', page: 'tasks', icon: 'list-checks', label: '任务' },
  { to: '/memory', page: 'memory', icon: 'brain', label: '记忆' },
] as const;

function pageOf(pathname: string): (typeof NAV)[number]['page'] | 'settings' {
  if (pathname.startsWith('/conversations')) return 'conversations';
  if (pathname.startsWith('/vision')) return 'vision';
  if (pathname.startsWith('/tasks')) return 'tasks';
  if (pathname.startsWith('/memory')) return 'memory';
  if (pathname.startsWith('/settings')) return 'settings';
  return 'home';
}

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    settings,
    aura,
    sensing,
    stopSensing,
    toggleSensor,
    pending,
    ollamaReady,
    levelRef,
    drawerOpen,
    setDrawerOpen,
    conversation,
    indexExpanded,
    toggleConversationIndex,
    closeConversationPopovers,
    toast,
  } = useSession();
  const page = pageOf(location.pathname);
  const os = resolvedOs(settings);
  const [systemReduced, setSystemReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const reduced = settings.motion === 'reduce' || (settings.motion !== 'full' && systemReduced);
  const connected = ollamaReady && settings.model === 'local';
  const [indicator, setIndicator] = useState({ x: 0, width: 0, visible: page !== 'settings' });
  const sensingOn = sensing.mic || sensing.cam || sensing.screen;
  document.body.dataset.page = page;
  document.body.dataset.os = os;
  document.body.dataset.state = aura;
  document.body.classList.toggle('has-sensing', sensingOn);
  document.documentElement.classList.toggle('reduce-motion', reduced);

  useEffect(() => {
    document.body.dataset.page = page;
    document.body.dataset.os = os;
    document.body.dataset.state = aura;
    document.body.classList.toggle('has-sensing', sensingOn);
    document.documentElement.classList.toggle('reduce-motion', reduced);
  }, [page, os, aura, sensingOn, reduced]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setSystemReduced(media.matches);
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    const place = () => {
      const current = document.querySelector<HTMLElement>(`#nav a[data-page="${page}"]`);
      if (!current) {
        setIndicator((value) => ({ ...value, visible: false }));
        return;
      }
      setIndicator({ x: current.offsetLeft, width: current.offsetWidth, visible: true });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [page, location.pathname]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target || anchor.hasAttribute('download')) return;
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#') || /^(https?:|mailto:|tel:)/.test(href)) return;
      const url = new URL(anchor.href);
      if (url.origin !== window.location.origin) return;
      const next = `${url.pathname}${url.search}${url.hash}`;
      const here = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      const section = (pathname: string) => pathname.split('/').filter(Boolean)[0] ?? '';
      if (next === here || section(url.pathname) === section(window.location.pathname)) return;
      event.preventDefault();
      event.stopPropagation();
      navigate(next);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [navigate]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod || event.altKey) return;
      const index = Number(event.key);
      if (index >= 1 && index <= 5) {
        event.preventDefault();
        const target = NAV[index - 1];
        if (target) navigate(target.to);
      }
      if (event.key === ',') {
        event.preventDefault();
        navigate('/settings');
      }
      if (event.shiftKey && event.code === 'Period') {
        event.preventDefault();
        stopSensing();
      }
      if (event.key.toLowerCase() === 'k') {
        event.preventDefault();
        document.querySelector<HTMLTextAreaElement>('.cmd-input')?.focus();
      }
      if (event.key.toLowerCase() === 'j') {
        event.preventDefault();
        if (page === 'home') setDrawerOpen(!drawerOpen);
        else if (page === 'conversations') toggleConversationIndex();
        else navigate('/conversations');
      }
      if (event.key.toLowerCase() === 'n') {
        event.preventDefault();
        if (page === 'home' && document.body.classList.contains('reading')) {
          document.dispatchEvent(new Event('aura-new-chat'));
        } else {
          navigate('/conversations/new');
        }
      }
    };
    const onAlt = (event: KeyboardEvent) => {
      if (event.altKey && event.code === 'Space') {
        event.preventDefault();
        void toggleSensor('mic');
      }
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (document.querySelector('.scrim.open, .menu.open')) return;
      if (page === 'home' && drawerOpen) {
        event.preventDefault();
        setDrawerOpen(false);
        return;
      }
      if (page === 'conversations' && (conversation.indexOpen || conversation.contextOpen)) {
        event.preventDefault();
        closeConversationPopovers();
        return;
      }
      if (sensing.mic || sensing.cam || sensing.screen) {
        event.preventDefault();
        stopSensing();
        toast('已停止全部感知');
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keydown', onAlt);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keydown', onAlt);
    };
  }, [
    navigate,
    stopSensing,
    toggleSensor,
    page,
    drawerOpen,
    setDrawerOpen,
    conversation.indexOpen,
    conversation.contextOpen,
    toggleConversationIndex,
    closeConversationPopovers,
    sensing.mic,
    sensing.cam,
    sensing.screen,
    toast,
  ]);

  return (
    <CoreProvider
      state={aura}
      reduced={reduced}
      dust={settings.dust}
      quality={settings.quality}
      levelRef={levelRef}
      onFallback={() => toast('图形渲染已暂停，已切换到兼容模式')}
    >
      <header className="titlebar">
        <div className="tb-left">
          {page === 'home' || page === 'conversations' ? (
            <button
              type="button"
              className="icon-btn icon-btn-sm"
              aria-label="会话列表"
              aria-expanded={page === 'home' ? drawerOpen : indexExpanded}
              aria-controls={page === 'home' ? 'drawer' : 'conversation-index'}
              data-tip={page === 'home' ? '会话 ⌘J' : '会话列表 ⌘J'}
              data-tip-pos="bottom"
              onClick={() => (page === 'home' ? setDrawerOpen(!drawerOpen) : toggleConversationIndex())}
            >
              <Icon name="panel-left" />
            </button>
          ) : null}
          {page === 'home' ? (
            <span className="wordmark">
              <WordmarkGlyph />
              AURA
            </span>
          ) : (
            <NavLink to="/" className="wordmark" aria-label="回到主页">
              <WordmarkGlyph />
              AURA
            </NavLink>
          )}
        </div>
        <nav className="navcap" id="nav" aria-label="主导航">
          <span
            className="navcap-ind"
            aria-hidden="true"
            style={{
              opacity: indicator.visible ? 1 : 0,
              width: indicator.width,
              transform: `translateX(${indicator.x}px)`,
            }}
          />
          {NAV.map((item) => (
            <NavLink
              key={item.page}
              to={item.to}
              data-page={item.page}
              aria-current={page === item.page ? 'page' : undefined}
            >
              <Icon name={item.icon} />
              <span className="lbl">{item.label}</span>
              {item.page === 'tasks' && pending > 0 ? (
                <span className="nav-badge" aria-label={`${pending} 项等待确认`}>
                  {pending}
                </span>
              ) : null}
            </NavLink>
          ))}
        </nav>
        <div className="tb-right">
          <div className="sensing" role="status" aria-live="polite">
            <span className="pill sense-mic" hidden={!sensing.mic}>
              <span className="dot" />
              麦克风
            </span>
            <span className="pill sense-cam" hidden={!sensing.cam}>
              <span className="dot" />
              摄像头
            </span>
            <span className="pill sense" hidden={!sensing.screen}>
              <span className="dot" />
              屏幕
            </span>
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              onClick={() => {
                stopSensing();
                toast('已停止全部感知');
              }}
            >
              <Icon name="power" className="i i-14" />
              全部停止
            </button>
          </div>
          <span className={`pill conn${connected ? ' ok' : ' warn'}`}>
            <span className="dot" />
            {connected ? '已连接' : '未配置'}
          </span>
          <NavLink
            to="/settings"
            className="icon-btn icon-btn-sm"
            aria-label="设置"
            aria-current={page === 'settings' ? 'page' : undefined}
            data-tip="设置 ⌘,"
            data-tip-pos="bottom"
          >
            <Icon name="settings" />
          </NavLink>
          <div className="wincontrols" aria-hidden="true">
            <button type="button" tabIndex={-1}>
              <Icon name="minus" className="i i-14" />
            </button>
            <button type="button" tabIndex={-1}>
              <Icon name="square" className="i i-14" />
            </button>
            <button type="button" tabIndex={-1} className="close">
              <Icon name="x" className="i i-14" />
            </button>
          </div>
        </div>
      </header>
      {children}
    </CoreProvider>
  );
}
