import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { NavLink, useNavigate, useParams } from 'react-router-dom';
import { useSession } from '../app/session';
import { useCoreSlot } from '../components/aura-core/CoreProvider';
import { Icon, Wordmark } from '../components/icon';
import { MODELS, type ModelId, type WebSettings } from '../state/settings';
import { listProviders, saveOpenAiKey } from '../chat/api';
import { fetchSpeech } from '../vision/api';
import { playWav, stopSpeech, unlockSpeech } from '../vision/playback';

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

const SHORTCUTS: [string, string[]][] = [
  ['聚焦命令栏', ['⌘', 'K']],
  ['开始语音', ['⌥', 'Space']],
  ['会话列表', ['⌘', 'J']],
  ['新对话', ['⌘', 'N']],
  ['打开设置', ['⌘', ',']],
  ['主页 / 对话 / 视觉 / 任务 / 记忆', ['⌘', '1–5']],
  ['停止生成或感知', ['Esc']],
  ['停止全部感知', ['⌘', '⇧', '.']],
];

type Section = (typeof SECTIONS)[number][0];

function gpuName() {
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    if (!gl) return '这台浏览器没有提供 WebGL。';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    return String(name || '已启用 WebGL');
  } catch {
    return '读不到渲染器名称。';
  }
}

export function SettingsPage() {
  const {
    settings,
    updateSettings: onChange,
    ollamaReady,
    ollamaModels,
    probeOllama: onProbe,
    sensing,
    streams,
    toggleSensor,
    stopSensing,
    levelRef,
    setAura,
    confirm,
    toast,
    account,
    logout,
    requireAccount,
  } = useSession();
  const navigate = useNavigate();
  const [openaiKey, setOpenaiKey] = useState('');
  const [openaiHint, setOpenaiHint] = useState<string | null>(null);
  const [openaiConfigured, setOpenaiConfigured] = useState(false);
  const { section = 'general' } = useParams();
  const current = (SECTIONS.some((item) => item[0] === section) ? section : 'general') as Section;
  const slot = useCoreSlot<HTMLButtonElement>(true);
  const [query, setQuery] = useState('');
  const [probe, setProbe] = useState(ollamaReady ? '上次测试已连通。' : '尚未测试。');
  useEffect(() => {
    if (!ollamaReady) return;
    setProbe(ollamaModels.length ? `已连通，可用 ${ollamaModels.length} 个模型` : '已连通');
  }, [ollamaReady, ollamaModels]);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [cams, setCams] = useState<MediaDeviceInfo[]>([]);
  const [perms, setPerms] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState(false);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [noHits, setNoHits] = useState(false);
  const micOwned = useRef(false);
  const camOwned = useRef(false);
  const searching = query.trim().length > 0;
  const localOnly = settings.runMode === 'local-only';

  useEffect(() => {
    if (!account) {
      setOpenaiConfigured(false);
      setOpenaiHint(null);
      return;
    }
    void listProviders()
      .then((rows) => {
        const openai = rows.find((item) => item.provider === 'openai');
        setOpenaiConfigured(Boolean(openai?.keyConfigured));
        setOpenaiHint(openai?.keyHint ?? null);
      })
      .catch(() => undefined);
  }, [account]);

  useEffect(() => {
    const load = () => setVoices(window.speechSynthesis?.getVoices() ?? []);
    load();
    window.speechSynthesis?.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis?.removeEventListener('voiceschanged', load);
  }, []);

  useEffect(() => {
    void navigator.mediaDevices?.enumerateDevices?.().then((list) => {
      setMics(list.filter((item) => item.kind === 'audioinput'));
      setCams(list.filter((item) => item.kind === 'videoinput'));
    });
  }, [sensing.mic, sensing.cam]);

  useEffect(() => {
    const names = ['microphone', 'camera'] as const;
    void Promise.all(
      names.map(async (name) => {
        try {
          const status = await navigator.permissions.query({ name });
          return [name, status.state] as const;
        } catch {
          return [name, 'unknown'] as const;
        }
      }),
    ).then((rows) => setPerms(Object.fromEntries(rows)));
  }, [sensing.mic, sensing.cam]);

  useEffect(() => {
    if (!video) return;
    video.srcObject = preview ? streams.cam : null;
    if (preview && streams.cam) void video.play().catch(() => undefined);
  }, [preview, streams.cam, video]);

  useEffect(() => {
    if (current === 'voice' || !micOwned.current) return;
    micOwned.current = false;
    void toggleSensor('mic');
  }, [current, toggleSensor]);

  useEffect(() => {
    if (current === 'vision' || !camOwned.current) return;
    camOwned.current = false;
    setPreview(false);
    void toggleSensor('cam');
  }, [current, toggleSensor]);

  useEffect(() => {
    const rows = [...document.querySelectorAll('.spanel .srow, .spanel .prow, .spanel .shortcut, .spanel .block')];
    document.querySelectorAll('.spanel section').forEach((sec) => {
      const own = [...sec.querySelectorAll('.srow, .prow, .shortcut, .block')];
      const visible = own.filter((row) => !row.classList.contains('is-out')).length;
      sec.setAttribute('data-empty', visible ? 'false' : 'true');
    });
    setNoHits(searching && rows.every((row) => row.classList.contains('is-out')));
  });

  const openSection = (id: Section) => (searching ? true : current === id);

  return (
    <main className={`page set${searching ? ' searching' : ''}`}>
      <nav className="snav scroll" aria-label="设置分组" data-enter="" style={{ ['--enter' as string]: 0 }}>
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
        {SECTIONS.map(([id, icon, label]) => (
          <button key={id} type="button" data-sec={id} aria-current={current === id ? 'true' : 'false'} onClick={() => navigate(`/settings/${id}`)}>
            <Icon name={icon} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="spanel scroll" data-enter="" style={{ ['--enter' as string]: 1 }}>
        <div className="sinner">
          <p className={`find-empty${noHits ? ' show' : ''}`}>没有匹配的设置项。试试「密钥」「麦克风」或「Ollama」。</p>

          <section id="sec-general" hidden={!openSection('general')}>
            <header>
              <h2>通用</h2>
              <p>窗口、外观和动效。登录自启和菜单栏驻留要等桌面版。</p>
            </header>
            <Row query={query} find="登录 启动 开机 菜单栏" title="登录时启动" desc="桌面版尚未提供。网页不能在开机时自己启动。">
              <Switch on={false} label="登录时启动" disabled />
            </Row>
            <Row query={query} find="关闭 退出 托盘 菜单栏" title="关闭窗口时" desc="桌面版尚未提供。浏览器标签关掉就是离开。">
              <Select value="quit" label="关闭窗口时" disabled onChange={() => undefined}>
                <option value="quit">离开页面</option>
              </Select>
            </Row>
            <Row query={query} find="打开 主页 对话 视觉" title="打开时进入" desc="记下偏好。网页里的地址仍由你当前打开的页面决定。">
              <Select value={settings.openOn} label="打开时进入" onChange={(value) => onChange({ openOn: value as WebSettings['openOn'] })}>
                <option value="home">主页</option>
                <option value="conversations">上次的对话</option>
                <option value="vision">视觉</option>
              </Select>
            </Row>
            <Row query={query} find="窗口 macOS Windows 标题栏" title="窗口样式" desc="自动跟随系统，也可以固定成 macOS 或 Windows。">
              <Select value={settings.os} label="窗口样式" onChange={(value) => onChange({ os: value as WebSettings['os'] })}>
                <option value="auto">跟随系统</option>
                <option value="mac">macOS</option>
                <option value="win">Windows</option>
              </Select>
            </Row>
            <Row query={query} find="外观 主题 深色 浅色" title="外观" desc="Presence 目前只有深色。浅色会在以后提供。">
              <Select value="dark" label="外观" disabled onChange={() => undefined}>
                <option value="dark">深色</option>
              </Select>
            </Row>
            <Row query={query} find="语言 中文 界面" title="界面语言" desc="界面是简体中文。朗读声音在「语音」里另选。">
              <Select value="zh-CN" label="界面语言" disabled onChange={() => undefined}>
                <option value="zh-CN">简体中文</option>
              </Select>
            </Row>
            <Row query={query} find="动效 减少 动画" title="动效" desc="减少动态后，核心几乎静止，页面不再飞入。">
              <Select value={settings.motion} label="动效" onChange={(value) => onChange({ motion: value as WebSettings['motion'] })}>
                <option value="system">跟随系统</option>
                <option value="full">保持动效</option>
                <option value="reduce">减少动态</option>
              </Select>
            </Row>
            <Row query={query} find="画质 粒子 泛光 性能" title="核心画质" desc="省电会关掉泛光并减少粒子。">
              <Select value={settings.quality} label="核心画质" onChange={(value) => onChange({ quality: value as WebSettings['quality'] })}>
                <option value="auto">自动</option>
                <option value="high">高画质</option>
                <option value="low">省电</option>
              </Select>
            </Row>
            <Row query={query} find="尘埃 粒子 背景" title="背景尘埃" desc="核心周围很淡的粒子。关掉后只保留主体。">
              <Switch on={settings.dust} label="背景尘埃" onClick={() => onChange({ dust: !settings.dust })} />
            </Row>
          </section>

          <section id="sec-models" hidden={!openSection('models')}>
            <header>
              <h2>模型</h2>
              <p>没有探测成功之前，提供方都显示未配置。网页不保存密钥。</p>
            </header>
            <Row query={query} find="运行 本地 云端" title="运行方式" desc="仅本地时，云端模型不可选。">
              <Select value={settings.runMode} label="运行方式" onChange={(value) => onChange({ runMode: value as WebSettings['runMode'] })}>
                <option value="local-first">本地优先</option>
                <option value="local-only">仅本地</option>
                <option value="cloud">优先云端</option>
              </Select>
            </Row>
            <Row query={query} find="默认 对话 模型" title="默认对话模型" desc="新对话使用这个模型。云端项未配置时不会发出请求。">
              <ModelSelect value={settings.model} label="默认对话模型" localOnly={localOnly} onChange={(value) => onChange({ model: value })} />
            </Row>
            <Row query={query} find="默认 视觉 模型 画面" title="默认视觉模型" desc="只在视觉页点「分析这一帧」时使用。本机需要已安装的看图模型；没有的话会说明，不会拿文字模型假装看过。">
              <ModelSelect value={settings.visionModel} label="默认视觉模型" localOnly={localOnly} onChange={(value) => onChange({ visionModel: value })} />
            </Row>
            <div className={`block${out(query, '提供方 ollama openai anthropic 密钥 key') ? ' is-out' : ''}`}>
              <h3>提供方</h3>
              <Provider find={query} name="Ollama" icon="hard-drive" desc="本机 · 不需要密钥" detail={settings.ollamaUrl} ok={ollamaReady} label={ollamaReady ? '已连接' : '未配置'} />
              <Provider
                find={query}
                name="OpenAI"
                icon="cloud"
                desc={openaiConfigured ? `密钥保存在服务器 ····${openaiHint ?? ''}` : 'GPT-4o · 网页不保存密钥'}
                blocked={localOnly}
                label={localOnly ? '仅本地模式不可用' : openaiConfigured ? '已保存密钥' : '未配置 Key'}
              />
              {account && !localOnly ? (
                <div className={`prow${out(query, 'openai 密钥 key') ? ' is-out' : ''}`}>
                  <Icon name="lock" />
                  <div className="prow-body">
                    <div className="prow-head">
                      <div>
                        <b>保存 OpenAI 密钥</b>
                        <span className="s">只发送一次到服务器，输入框随后清空。</span>
                      </div>
                    </div>
                    <div className="prow-actions">
                      <input
                        className="input"
                        type="password"
                        autoComplete="off"
                        aria-label="OpenAI 密钥"
                        placeholder="sk-…"
                        value={openaiKey}
                        onChange={(event) => setOpenaiKey(event.target.value)}
                      />
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={openaiKey.trim().length < 8}
                        onClick={() => {
                          const key = openaiKey.trim();
                          setOpenaiKey('');
                          void saveOpenAiKey(key)
                            .then(() => listProviders())
                            .then((rows) => {
                              const openai = rows.find((item) => item.provider === 'openai');
                              setOpenaiConfigured(Boolean(openai?.keyConfigured));
                              setOpenaiHint(openai?.keyHint ?? null);
                              toast('密钥已保存在服务器');
                            })
                            .catch((error: unknown) => toast(error instanceof Error ? error.message : '密钥没有保存', { icon: 'circle-alert' }));
                        }}
                      >
                        保存
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
              <Provider find={query} name="Anthropic" icon="cloud" desc="Claude Sonnet 4 · 网页不保存密钥" blocked={localOnly} label={localOnly ? '仅本地模式不可用' : '未配置 Key'} />
            </div>
          </section>

          <section id="sec-voice" hidden={!openSection('voice')}>
            <header>
              <h2>语音</h2>
              <p>麦克风只在你按下语音键或这里的测试之后打开。</p>
            </header>
            <Row query={query} find="唤醒 你好 aura 后台" title="唤醒词" desc="这一版保持关闭，避免在后台监听。">
              <Switch on={false} label="唤醒词" onClick={() => toast('唤醒词在这一版保持关闭，避免在后台监听', { icon: 'mic-off' })} />
            </Row>
            <Row query={query} find="麦克风 输入 设备" title="麦克风" desc={mics.some((item) => item.label) ? '下面是这台浏览器能看到的输入设备。' : '允许权限后才会显示设备名称。'}>
              <Select value={settings.micDevice} label="麦克风" onChange={(value) => onChange({ micDevice: value })}>
                <option value="">系统默认</option>
                {mics.map((item) => (
                  <option key={item.deviceId} value={item.deviceId}>
                    {item.label || '麦克风'}
                  </option>
                ))}
              </Select>
            </Row>
            <Row query={query} find="试听 电平 麦克风 测试" title="测试麦克风" desc="读取真实音量。标题栏会显示麦克风指示。" col>
                <Meter active={sensing.mic} levelRef={levelRef} />
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    micOwned.current = !sensing.mic;
                    void toggleSensor('mic');
                  }}
                >
                  <Icon name="mic" />
                  {sensing.mic ? '停止测试' : '开始测试'}
                </button>
            </Row>
            <Row query={query} find="转写 语音识别 whisper" title="语音转文字" desc="浏览器引擎在本机转写。Whisper 这一版只作为选项记下。">
              <Select value={settings.stt} label="语音转文字" onChange={(value) => onChange({ stt: value as WebSettings['stt'] })}>
                <option value="browser">浏览器（本机）</option>
                <option value="whisper">Whisper · 本地（未接入）</option>
              </Select>
            </Row>
            <Row query={query} find="朗读 自动 语音提问" title="语音提问后自动朗读" desc="只对你用语音发出去的那一轮生效。读的是本机语音。">
              <Switch on={settings.autoRead} label="自动朗读" onClick={() => onChange({ autoRead: !settings.autoRead })} />
            </Row>
            <Row query={query} find="语速 朗读" title="语速" desc={`${settings.rate.toFixed(2)}×`}>
              <input
                className="range"
                type="range"
                min={0.8}
                max={1.4}
                step={0.05}
                aria-label="语速"
                value={settings.rate}
                style={{ ['--p' as string]: `${((settings.rate - 0.8) / 0.6) * 100}%` }}
                onChange={(event) => onChange({ rate: Number(event.target.value) })}
              />
            </Row>
            <Row query={query} find="声音 音色 tts" title="朗读声音" desc="记下偏好。这一版实际朗读使用本机中文语音，还不会按这里的选择切换。">
              <Select value={settings.voice} label="朗读声音" onChange={(value) => onChange({ voice: value })}>
                <option value="">系统默认</option>
                {voices.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </Row>
            <Row query={query} find="输出 扬声器 耳机" title="播放设备" desc="浏览器通常不允许网页指定扬声器。">
              <Select value="" label="播放设备" disabled onChange={() => undefined}>
                <option value="">系统默认输出</option>
              </Select>
            </Row>
            <Row query={query} find="试听 朗读 一句" title="试听朗读" desc="用当前语速读一句。走本机语音，不是模型在说话。">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  unlockSpeech();
                  stopSpeech();
                  setAura('speaking');
                  void fetchSpeech('你好，我是 AURA。', settings.rate || 1)
                    .then((bytes) => playWav(bytes))
                    .then(() => setAura('idle'))
                    .catch(() => {
                      toast('这一句没有读出来', { icon: 'circle-alert' });
                      setAura('idle');
                    });
                }}
              >
                <Icon name="volume-2" />
                朗读一句
              </button>
            </Row>
          </section>

          <section id="sec-vision" hidden={!openSection('vision')}>
            <header>
              <h2>摄像头与屏幕</h2>
              <p>默认手动采集。持续感知要在视觉页里由你打开。</p>
            </header>
            <Row query={query} find="摄像头 设备 选择" title="默认摄像头" desc={cams.some((item) => item.label) ? '下面是这台浏览器能看到的摄像头。' : '允许权限后才会显示设备名称。这里不会自动打开画面。'}>
              <Select value={settings.camDevice} label="默认摄像头" onChange={(value) => onChange({ camDevice: value })}>
                <option value="">系统默认</option>
                {cams.map((item) => (
                  <option key={item.deviceId} value={item.deviceId}>
                    {item.label || '摄像头'}
                  </option>
                ))}
              </Select>
            </Row>
            <Row query={query} find="预览 试拍 摄像头" title="预览一下" desc="打开后确认朝向。离开这一页就会停止这里打开的预览。" col>
                <div className="preview">
                  <span className="ph" hidden={preview && Boolean(streams.cam)}>
                    未打开
                  </span>
                  <video ref={setVideo} playsInline muted hidden={!preview || !streams.cam} />
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    if (preview) {
                      setPreview(false);
                      if (camOwned.current) {
                        camOwned.current = false;
                        void toggleSensor('cam');
                      }
                      return;
                    }
                    setPreview(true);
                    if (!sensing.cam) {
                      camOwned.current = true;
                      void toggleSensor('cam');
                    }
                  }}
                >
                  <Icon name="webcam" />
                  {preview ? '关闭预览' : '打开预览'}
                </button>
            </Row>
            <Row query={query} find="间隔 持续 采样" title="持续检查的间隔" desc="这一阶段不会自动连续分析。这个间隔只限制「分析这一帧」的连续点击。">
              <Select value={settings.interval} label="检查间隔" onChange={(value) => onChange({ interval: value as WebSettings['interval'] })}>
                <option value="2">每 2 秒</option>
                <option value="5">每 5 秒</option>
                <option value="10">每 10 秒</option>
                <option value="30">每 30 秒</option>
              </Select>
            </Row>
            <Row query={query} find="阈值 变化 跳过" title="变化阈值" desc={`低于 ${settings.sensitivity}% 的帧会被跳过。持续分析还没有做，现在不会按阈值挑帧。`}>
              <input
                className="range"
                type="range"
                min={4}
                max={40}
                step={1}
                aria-label="变化阈值"
                value={settings.sensitivity}
                style={{ ['--p' as string]: `${((settings.sensitivity - 4) / 36) * 100}%` }}
                onChange={(event) => onChange({ sensitivity: Number(event.target.value) })}
              />
            </Row>
            <Row query={query} find="记录 缩略图 保留" title="分析记录保留" desc="视觉页的记录默认只留在当前会话。">
              <Select value={settings.keepShots} label="分析记录保留" onChange={(value) => onChange({ keepShots: value as WebSettings['keepShots'] })}>
                <option value="session">离开页面即清除</option>
                <option value="day">保留到今天结束</option>
              </Select>
            </Row>
            <Row query={query} find="屏幕 窗口 采集" title="现在去看画面" desc="摄像头和屏幕都要在视觉页里由你打开。">
              <NavLink className="btn btn-secondary" to="/vision">
                打开视觉
              </NavLink>
            </Row>
          </section>

          <section id="sec-privacy" hidden={!openSection('privacy')}>
            <header>
              <h2>隐私与权限</h2>
              <p>使用统计保持关闭。网页不会发送使用数据。</p>
            </header>
            <Row query={query} find="上传 云端 同意" title="云端上传" desc="视觉模型选了云端、并且点「分析这一帧」时，如何征得同意。本机看图不走这条。">
              <Select value={settings.uploadAsk} label="云端上传" onChange={(value) => onChange({ uploadAsk: value as WebSettings['uploadAsk'] })}>
                <option value="ask">每次询问</option>
                <option value="always">这次会话内记住允许</option>
                <option value="never">不允许上传</option>
              </Select>
            </Row>
            <Row query={query} find="统计 遥测 分析" title="使用统计" desc="关闭。这一版不会向任何服务器发送使用数据。">
              <Switch on={false} label="使用统计" onClick={() => toast('使用统计保持关闭', { icon: 'shield' })} />
            </Row>
            <div className={`block${out(query, '权限 摄像头 麦克风 屏幕') ? ' is-out' : ''}`}>
              <h3>权限</h3>
              <p>麦克风：{permLabel(perms.microphone)} · 摄像头：{permLabel(perms.camera)} · 屏幕：要在选择来源时由系统询问</p>
            </div>
            <Row query={query} find="停止 感知 全部" title="停止全部感知" desc="麦克风、摄像头和屏幕采集一起关掉。">
              <button type="button" className="btn btn-secondary" onClick={() => stopSensing()}>
                <Icon name="power" />
                全部停止
              </button>
            </Row>
            <Row query={query} find="导出 备份 数据" title="导出本地数据" desc="导出这台浏览器里的设置。记忆留在账号里，这里没有密钥。">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  const blob = new Blob(
                    [JSON.stringify({ exportedAt: new Date().toISOString(), settings }, null, 2)],
                    { type: 'application/json' },
                  );
                  const link = document.createElement('a');
                  link.href = URL.createObjectURL(blob);
                  link.download = 'aura-local-data.json';
                  link.click();
                  window.setTimeout(() => URL.revokeObjectURL(link.href), 800);
                  toast('已导出本地数据，不含密钥', { icon: 'download' });
                }}
              >
                <Icon name="download" />
                导出
              </button>
            </Row>
            <Row query={query} find="清除 缓存 对话" title="清除会话索引" desc="只删这台浏览器记下的会话折叠状态。演示对话内容不受影响。">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  localStorage.removeItem('aura-convs-meta');
                  toast('已清除会话索引', { icon: 'trash-2' });
                }}
              >
                清除
              </button>
            </Row>
          </section>

          <section id="sec-memory" hidden={!openSection('memory')}>
            <header>
              <h2>记忆</h2>
              <p>记忆记在当前账号里。待确认的不会进入对话。</p>
            </header>
            <Row query={query} find="条数 记忆 统计" title="当前条目" desc="到记忆页查看、确认或删除。浏览器里不再保存一份演示记忆。">
              <NavLink className="btn btn-secondary" to="/memory">
                打开记忆
              </NavLink>
            </Row>
            <Row query={query} find="自动 学习 写入" title="对话后提议写入" desc="当你说出「记住」或「以后」时，会放进待确认。确认前不会进入对话。">
              <Switch on={settings.memoryAuto} label="对话后提议写入" onClick={() => onChange({ memoryAuto: !settings.memoryAuto })} />
            </Row>
            <Row query={query} find="保留 期限 过期" title="保留期限" desc="还不会按这个期限自动删除。条目会留到你自己删掉。">
              <Select value={settings.retention} label="保留期限" onChange={(value) => onChange({ retention: value as WebSettings['retention'] })}>
                <option value="30">30 天</option>
                <option value="90">90 天</option>
                <option value="365">一年</option>
                <option value="keep">一直保留</option>
              </Select>
            </Row>
            <Row query={query} find="清空 删除 未固定" title="清空未固定的记忆" desc="固定的条目会留下。删掉的不会再进入对话。">
              <button
                type="button"
                className="btn btn-secondary btn-warn"
                onClick={() => {
                  void confirm({
                    risk: '未固定的条目会从账号里消失',
                    title: '清空未固定的记忆？',
                    desc: '固定的条目会留下。',
                    rows: [
                      ['brain', '会删除', '所有未固定的记忆'],
                      ['pin', '会留下', '你标记为固定的条目'],
                    ],
                    deny: '取消',
                    allow: '清空',
                    danger: true,
                  }).then(async (ok) => {
                    if (!ok) return;
                    if (!(await requireAccount())) return;
                    const { listMemories, deleteMemory } = await import('../memory/api');
                    const rows = await listMemories().catch(() => []);
                    await Promise.all(rows.filter((item) => !item.pinned).map((item) => deleteMemory(item.id).catch(() => undefined)));
                    toast('已清空未固定的记忆', { icon: 'trash-2' });
                  });
                }}
              >
                清空
              </button>
            </Row>
          </section>

          <section id="sec-shortcuts" hidden={!openSection('shortcuts')}>
            <header>
              <h2>快捷键</h2>
              <p>下面是现在生效的组合。</p>
            </header>
            {SHORTCUTS.map(([label, keys]) => (
              <div key={label} className={`shortcut${out(query, label) ? ' is-out' : ''}`}>
                <span>{label}</span>
                <span className="keys">
                  {keys.map((key) => (
                    <span key={key} className="kbd">
                      {key}
                    </span>
                  ))}
                </span>
              </div>
            ))}
            <Row query={query} find="复制 快捷键" title="复制列表" desc="方便贴进自己的笔记。">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  const text = SHORTCUTS.map(([label, keys]) => `${label}　${keys.join(' ')}`).join('\n');
                  void navigator.clipboard.writeText(text).then(
                    () => toast('已复制快捷键列表', { icon: 'copy' }),
                    () => toast('这个环境不允许写入剪贴板', { icon: 'circle-alert' }),
                  );
                }}
              >
                <Icon name="copy" />
                复制
              </button>
            </Row>
          </section>

          <section id="sec-runtime" hidden={!openSection('runtime')}>
            <header>
              <h2>本地运行</h2>
              <p>点测试会真的请求你填写的 Ollama 地址。</p>
            </header>
            <Row query={query} find="ollama 地址 端口" title="Ollama 地址" desc={probe} col>
                <input className="input" aria-label="Ollama 地址" value={settings.ollamaUrl} onChange={(event) => onChange({ ollamaUrl: event.target.value })} />
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
            <Row query={query} find="gpu 显卡 webgl" title="图形设备" desc={gpuName()}>
              <Select value={settings.gpu} label="图形设备" onChange={(value) => onChange({ gpu: value as WebSettings['gpu'], quality: value === 'auto' ? settings.quality : (value as WebSettings['quality']) })}>
                <option value="auto">自动</option>
                <option value="high">优先 GPU</option>
                <option value="low">降低特效</option>
              </Select>
            </Row>
            <Row query={query} find="上下文 长度 token" title="上下文长度" desc="记下偏好。发给模型时，这一阶段还没有按这个数字截断。">
              <Select value={settings.ctx} label="上下文长度" onChange={(value) => onChange({ ctx: value as WebSettings['ctx'] })}>
                <option value="4096">4,096</option>
                <option value="8192">8,192</option>
                <option value="16384">16,384</option>
                <option value="32768">32,768</option>
              </Select>
            </Row>
            <Row query={query} find="保活 keepalive 卸载" title="模型保活" desc="空闲多久之后从内存卸下。浏览器不会拉起或卸下 Ollama 进程。">
              <Select value={settings.keepAlive} label="模型保活" onChange={(value) => onChange({ keepAlive: value as WebSettings['keepAlive'] })}>
                <option value="0">立即卸下</option>
                <option value="5m">5 分钟</option>
                <option value="30m">30 分钟</option>
                <option value="-1">保持加载</option>
              </Select>
            </Row>
            <Row query={query} find="自启 ollama 启动" title="需要时拉起 Ollama" desc="只保存偏好。网页不能在本机拉起进程。">
              <Switch on={settings.autostart} label="需要时拉起 Ollama" onClick={() => onChange({ autostart: !settings.autostart })} />
            </Row>
            <Row query={query} find="当前 对话 模型" title="当前对话模型" desc="和命令栏里的选择是同一个。">
              <span className="pill">
                {MODELS[settings.model].name} · {MODELS[settings.model].where} · {settings.model === 'local' && ollamaReady ? '已连接' : '未就绪'}
              </span>
            </Row>
            <div className={`block${out(query, '本机 模型 列表') ? ' is-out' : ''}`}>
              <h3>本机已列出的模型</h3>
              {ollamaModels.length === 0 ? <p className="s">测试连接成功后，会把 /api/tags 返回的名称列在这里。</p> : null}
              <ul className="local-models">
                {ollamaModels.map((name) => (
                  <li key={name}>
                    <span className="n">{name}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section id="sec-about" hidden={!openSection('about')}>
            <header>
              <h2>关于</h2>
              <p>AURA 是个人桌面助手。这一版先把 Presence 界面跑在网页里。</p>
            </header>
            <div className="about-mark">
              <img className="about-icon" src="/logo/aura-app-icon.svg" width="48" height="48" alt="AURA 应用图标" />
              <Wordmark />
              <span className="pill">Presence · Web</span>
            </div>
            <Row query={query} find="账号 登录 退出" title="账号" desc={account ? account.email : '发送对话前会要求登录。会话保存在你的账号下。'}>
              {account ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    void logout().then(() => {
                      toast('已退出登录');
                      navigate('/');
                    });
                  }}
                >
                  退出登录
                </button>
              ) : (
                <span className="status-line">未登录</span>
              )}
            </Row>
            <Row query={query} find="版本 build" title="版本" desc="界面来自 v2 设计稿。任务里的示例仍标成演示。记忆记在账号里。">
              <span className="num status-line">2026.11</span>
            </Row>
            <Row query={query} find="字体 geist 许可" title="字体" desc="Geist / Geist Mono，SIL Open Font License 1.1。">
              <a className="btn btn-secondary" href="/fonts/LICENSE-Geist-OFL.txt">
                许可
              </a>
            </Row>
            <Row query={query} find="依赖 three motion lucide" title="开源依赖" desc="Three.js、Lucide。图标与三维核心都在项目本地。">
              <span className="status-line">本地资源</span>
            </Row>
            <Row query={query} find="恢复 默认 重置" title="恢复默认设置" desc="清除这台浏览器上的 AURA 设置。记忆和会话索引不会动。">
              <button
                type="button"
                className="btn btn-secondary btn-warn"
                onClick={() => {
                  void confirm({
                    risk: '会恢复这台浏览器上的 AURA 设置',
                    title: '恢复默认设置？',
                    desc: '记忆和会话索引会留下。模型选择会回到本地 Qwen2.5 7B。',
                    rows: [
                      ['sliders-horizontal', '会清除', '窗口、模型、语音、隐私等偏好'],
                      ['brain', '会留下', '记忆条目'],
                    ],
                    deny: '取消',
                    allow: '恢复默认',
                    danger: true,
                  }).then((ok) => {
                    if (!ok) return;
                    localStorage.removeItem('aura-web-settings');
                    window.location.reload();
                  });
                }}
              >
                恢复默认
              </button>
            </Row>
          </section>
        </div>
      </div>
    </main>
  );
}

function out(query: string, text: string) {
  const q = query.trim().toLowerCase();
  return Boolean(q) && !`${text}`.toLowerCase().includes(q);
}

function permLabel(state?: string) {
  if (state === 'granted') return '已允许';
  if (state === 'denied') return '已拒绝';
  if (state === 'prompt') return '未询问';
  return '浏览器未提供这项状态';
}

function Row({
  query,
  find,
  title,
  desc,
  col,
  children,
}: {
  query: string;
  find: string;
  title: string;
  desc: string;
  col?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`srow${out(query, `${find} ${title} ${desc}`) ? ' is-out' : ''}`}>
      <div>
        <h3>{title}</h3>
        <p>{desc}</p>
      </div>
      <div className={col ? 'ctl col' : 'ctl'}>{children}</div>
    </div>
  );
}

function Switch({ on, label, disabled, onClick }: { on: boolean; label: string; disabled?: boolean; onClick?: () => void }) {
  return (
    <button type="button" className="switch" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={onClick} />
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

function ModelSelect({
  value,
  label,
  localOnly,
  onChange,
}: {
  value: ModelId;
  label: string;
  localOnly: boolean;
  onChange: (value: ModelId) => void;
}) {
  return (
    <Select value={value} label={label} onChange={(next) => onChange(next as ModelId)}>
      {(Object.keys(MODELS) as ModelId[]).map((id) => (
        <option key={id} value={id} disabled={localOnly && MODELS[id].cloud}>
          {MODELS[id].name} · {MODELS[id].where}
          {localOnly && MODELS[id].cloud ? '（仅本地不可用）' : MODELS[id].cloud ? '（未配置）' : ''}
        </option>
      ))}
    </Select>
  );
}

function Provider({
  find,
  name,
  icon,
  desc,
  detail,
  ok,
  blocked,
  label,
}: {
  find: string;
  name: string;
  icon: string;
  desc: string;
  detail?: string;
  ok?: boolean;
  blocked?: boolean;
  label: string;
}) {
  return (
    <div className={`prow${out(find, `${name} ${desc} key provider api`) ? ' is-out' : ''}`}>
      <Icon name={icon} />
      <div className="prow-body">
        <div className="prow-head">
          <div>
            <b>{name}</b>
            <span className="s">{desc}</span>
            {detail ? <span className="s">{detail}</span> : null}
          </div>
          <span className={`pill ${ok ? 'ok' : 'warn'}`}>
            <span className="dot" />
            {blocked ? '仅本地模式不可用' : label}
          </span>
        </div>
      </div>
    </div>
  );
}

function Meter({ active, levelRef }: { active: boolean; levelRef: RefObject<number> }) {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!active) {
      setLevel(0);
      return;
    }
    let frame = 0;
    const pump = () => {
      setLevel(levelRef.current);
      frame = requestAnimationFrame(pump);
    };
    frame = requestAnimationFrame(pump);
    return () => cancelAnimationFrame(frame);
  }, [active, levelRef]);
  return (
    <div className="vu">
      <div className="meter" aria-hidden="true">
        <i style={{ ['--v' as string]: level }} />
      </div>
    </div>
  );
}
