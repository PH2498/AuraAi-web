import { useMemo, useState, type ReactNode } from 'react';
import { NavLink, useNavigate, useParams } from 'react-router-dom';
import { useSession } from '../app/session';
import { useCoreSlot } from '../components/aura-core/CoreProvider';
import { Icon, Wordmark } from '../components/icon';
import { MODELS, type ModelId, type WebSettings } from '../state/settings';

const SECTIONS = [
  ['general', 'sliders-horizontal', '通用'],
  ['models', 'cpu', '模型'],
  ['voice', 'audio-lines', '语音'],
  ['vision', 'scan-eye', '摄像头与屏幕'],
  ['privacy', 'shield', '隐私与权限'],
  ['memory', 'brain', '记忆'],
  ['shortcuts', 'keyboard', '快捷键'],
  ['runtime', 'server', '本地运行'],
  ['about', 'info', '关于'],
] as const;

type Section = (typeof SECTIONS)[number][0];

export function SettingsPage() {
  const { settings, updateSettings: onChange, ollamaReady, probeOllama: onProbe } = useSession();
  const navigate = useNavigate();
  const { section = 'general' } = useParams();
  const current = (SECTIONS.some((item) => item[0] === section) ? section : 'general') as Section;
  const slot = useCoreSlot<HTMLButtonElement>(true);
  const [query, setQuery] = useState('');
  const [probe, setProbe] = useState(ollamaReady ? '上次测试已连通。' : '尚未测试。');
  const visible = useMemo(() => {
    const q = query.trim();
    if (!q) return SECTIONS.map((item) => item[0]);
    return SECTIONS.filter((item) => item[2].includes(q)).map((item) => item[0]);
  }, [query]);

  return (
    <main className="page set">
      <nav className="snav scroll" aria-label="设置分组">
        <NavLink className="snav-brand" to="/" aria-label="AURA 主页">
          <img className="snav-logo" src="/logo/aura-app-icon.svg" width="32" height="32" alt="" />
          <span className="snav-name">AURA</span>
        </NavLink>
        <h1 className="sr-only">设置</h1>
        <label className="find">
          <Icon name="search" className="i i-14" />
          <input className="input" value={query} placeholder="搜索设置" aria-label="搜索设置" onChange={(event) => setQuery(event.target.value)} />
        </label>
        <button ref={slot} className="core-slot" type="button" aria-label="AURA 状态" />
        {SECTIONS.filter((item) => visible.includes(item[0])).map(([id, icon, label]) => (
          <button key={id} type="button" data-sec={id} aria-current={current === id} onClick={() => navigate(`/settings/${id}`)}>
            <Icon name={icon} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="spanel scroll">
        <div className="sinner">
          {visible.length === 0 ? <p className="find-empty">没有匹配的设置项。</p> : null}

          {visible.includes('general') ? (
            <section hidden={current !== 'general'}>
              <header>
                <h2>通用</h2>
                <p>窗口、外观和动效。登录自启和菜单栏驻留要等桌面版。</p>
              </header>
              <Row title="登录时启动" desc="桌面版尚未提供。网页不能在开机时自己启动。">
                <button type="button" className="switch" role="switch" aria-checked="false" disabled aria-label="登录时启动" />
              </Row>
              <Row title="关闭窗口时" desc="桌面版尚未提供。浏览器标签关掉就是离开。">
                <Select value="quit" disabled label="关闭窗口时" onChange={() => undefined}>
                  <option value="quit">离开页面</option>
                </Select>
              </Row>
              <Row title="窗口样式" desc="自动跟随系统，也可以固定成 macOS 或 Windows。">
                <Select value={settings.os} label="窗口样式" onChange={(value) => onChange({ os: value as WebSettings['os'] })}>
                  <option value="auto">跟随系统</option>
                  <option value="mac">macOS</option>
                  <option value="win">Windows</option>
                </Select>
              </Row>
              <Row title="外观" desc="Presence 目前只有深色。">
                <Select value="dark" disabled label="外观" onChange={() => undefined}>
                  <option value="dark">深色</option>
                </Select>
              </Row>
              <Row title="动效" desc="减少动态后，核心几乎静止，页面不再飞入。">
                <Select value={settings.motion} label="动效" onChange={(value) => onChange({ motion: value as WebSettings['motion'] })}>
                  <option value="system">跟随系统</option>
                  <option value="full">保持动效</option>
                  <option value="reduce">减少动态</option>
                </Select>
              </Row>
              <Row title="背景尘埃" desc="核心周围很淡的粒子。关掉后只保留主体。">
                <button
                  type="button"
                  className="switch"
                  role="switch"
                  aria-checked={settings.dust}
                  aria-label="背景尘埃"
                  onClick={() => onChange({ dust: !settings.dust })}
                />
              </Row>
            </section>
          ) : null}

          {visible.includes('models') ? (
            <section hidden={current !== 'models'}>
              <header>
                <h2>模型</h2>
                <p>没有探测成功之前，提供方都显示未配置。</p>
              </header>
              <Row title="运行方式" desc="仅本地时，云端模型不可选。">
                <Select value={settings.runMode} label="运行方式" onChange={(value) => onChange({ runMode: value as WebSettings['runMode'] })}>
                  <option value="local-first">本地优先</option>
                  <option value="local-only">仅本地</option>
                  <option value="cloud">优先云端</option>
                </Select>
              </Row>
              <Row title="默认对话模型" desc="新对话使用这个模型。云端项在未配置时仍可选，但不会发出请求。">
                <Select value={settings.model} label="默认对话模型" onChange={(value) => onChange({ model: value as ModelId })}>
                  {(Object.keys(MODELS) as ModelId[]).map((id) => (
                    <option key={id} value={id}>
                      {MODELS[id].name}
                    </option>
                  ))}
                </Select>
              </Row>
              <div className="block">
                <h3>提供方</h3>
                <p>Ollama {ollamaReady ? '已连接' : '未配置'} · OpenAI 未配置 Key · Anthropic 未配置 Key</p>
              </div>
            </section>
          ) : null}

          {visible.includes('voice') ? (
            <section hidden={current !== 'voice'}>
              <header>
                <h2>语音</h2>
                <p>麦克风只在你按下语音键之后打开。</p>
              </header>
              <Row title="唤醒词" desc="关闭。这一版不会在后台监听。">
                <button type="button" className="switch" role="switch" aria-checked="false" disabled aria-label="唤醒词" />
              </Row>
            </section>
          ) : null}

          {visible.includes('vision') ? (
            <section hidden={current !== 'vision'}>
              <header>
                <h2>摄像头与屏幕</h2>
                <p>默认手动采集。这里不会自动打开画面。</p>
              </header>
              <Row title="现在去看画面" desc="摄像头和屏幕都要在视觉页里由你打开。">
                <NavLink className="btn btn-secondary" to="/vision">
                  打开视觉
                </NavLink>
              </Row>
            </section>
          ) : null}

          {visible.includes('privacy') ? (
            <section hidden={current !== 'privacy'}>
              <header>
                <h2>隐私与权限</h2>
                <p>使用统计保持关闭。网页不会发送使用数据。</p>
              </header>
              <Row title="云端上传" desc="选了云端模型并附带画面时，如何征得同意。">
                <Select value={settings.uploadAsk} label="云端上传" onChange={(value) => onChange({ uploadAsk: value as WebSettings['uploadAsk'] })}>
                  <option value="ask">每次询问</option>
                  <option value="always">这次会话内记住允许</option>
                  <option value="never">不允许上传</option>
                </Select>
              </Row>
            </section>
          ) : null}

          {visible.includes('memory') ? (
            <section hidden={current !== 'memory'}>
              <header>
                <h2>记忆</h2>
                <p>记忆页列出演示条目和你手动添加的内容。</p>
              </header>
              <Row title="对话后提议写入" desc="模型接入之前，不会自动提议写入。">
                <button
                  type="button"
                  className="switch"
                  role="switch"
                  aria-checked={settings.memoryAuto}
                  aria-label="对话后提议写入"
                  onClick={() => onChange({ memoryAuto: !settings.memoryAuto })}
                />
              </Row>
              <Row title="保留期限" desc="固定的条目不受期限影响。">
                <Select value={settings.retention} label="保留期限" onChange={(value) => onChange({ retention: value as WebSettings['retention'] })}>
                  <option value="30">30 天</option>
                  <option value="90">90 天</option>
                  <option value="365">一年</option>
                  <option value="keep">一直保留</option>
                </Select>
              </Row>
            </section>
          ) : null}

          {visible.includes('shortcuts') ? (
            <section hidden={current !== 'shortcuts'}>
              <header>
                <h2>快捷键</h2>
                <p>这些组合现在就生效。</p>
              </header>
              <Shortcut k="⌘K" label="聚焦命令栏" />
              <Shortcut k="⌘J" label="会话列表" />
              <Shortcut k="⌘N" label="新对话" />
              <Shortcut k="⌘," label="设置" />
              <Shortcut k="⌘1–5" label="五个主导航" />
              <Shortcut k="⌘⇧." label="停止全部感知" />
            </section>
          ) : null}

          {visible.includes('runtime') ? (
            <section hidden={current !== 'runtime'}>
              <header>
                <h2>本地运行</h2>
                <p>测试会真的请求你填写的 Ollama 地址。</p>
              </header>
              <Row title="Ollama 地址" desc={probe}>
                <input
                  className="input"
                  aria-label="Ollama 地址"
                  value={settings.ollamaUrl}
                  onChange={(event) => onChange({ ollamaUrl: event.target.value })}
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setProbe('正在测试…');
                    void onProbe(settings.ollamaUrl).then(setProbe);
                  }}
                >
                  测试连接
                </button>
              </Row>
            </section>
          ) : null}

          {visible.includes('about') ? (
            <section hidden={current !== 'about'}>
              <header>
                <h2>关于</h2>
                <p>AURA 是个人桌面助手。这一版先把 Presence 界面跑在网页里。</p>
              </header>
              <div className="about-mark">
                <img className="about-icon" src="/logo/aura-app-icon.svg" width="48" height="48" alt="AURA 应用图标" />
                <Wordmark />
                <span className="pill">Presence · Web</span>
              </div>
              <Row title="版本" desc="界面来自 v2 设计稿。回复、任务和记忆里的示例都标成演示。">
                <span className="num status-line">Phase 2</span>
              </Row>
            </section>
          ) : null}
        </div>
      </div>
    </main>
  );
}

function Row({ title, desc, children }: { title: string; desc: string; children: ReactNode }) {
  return (
    <div className="srow">
      <div>
        <h3>{title}</h3>
        <p>{desc}</p>
      </div>
      <div className="ctl">{children}</div>
    </div>
  );
}

function Select({
  value,
  label,
  disabled,
  onChange,
  children,
}: {
  value: string;
  label: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <span className="select">
      <select aria-label={label} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
      <Icon name="chevron-down" className="i i-14" />
    </span>
  );
}

function Shortcut({ k, label }: { k: string; label: string }) {
  return (
    <div className="shortcut">
      <span>{label}</span>
      <span className="keys">
        <span className="kbd">{k}</span>
      </span>
    </div>
  );
}
