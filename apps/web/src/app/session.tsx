import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { createWebPlatform, PlatformCapabilityError } from '@aura/platform';
import { ConfirmDialog, type ConfirmOptions } from '../components/confirm-dialog';
import { LoginDialog } from '../components/login-dialog';
import { currentAccount, loginAccount, logoutAccount, refreshOllama, type Account } from '../chat/api';
import { TASKS } from '../fixtures/content';
import { loadSettings, saveSettings, type AuraState, type WebSettings } from '../state/settings';

const platform = createWebPlatform();

type Sensor = 'mic' | 'cam' | 'screen';
type Streams = Record<Sensor, MediaStream | null>;

type SensorResult = { ok: true; active: boolean } | { ok: false; message: string };

type ToastAction = { label: string; run: () => void };
type ToastItem = { id: number; text: string; icon: string; action?: ToastAction };
type DialogRequest = ConfirmOptions & { key: number };

type Session = {
  settings: WebSettings;
  updateSettings: (patch: Partial<WebSettings>) => void;
  aura: AuraState;
  setAura: (state: AuraState) => void;
  streams: Streams;
  sensing: Record<Sensor, boolean>;
  levelRef: RefObject<number>;
  toggleSensor: (kind: Sensor) => Promise<SensorResult>;
  stopSensing: () => void;
  ollamaReady: boolean;
  ollamaModels: string[];
  account: Account | null;
  requireAccount: () => Promise<boolean>;
  logout: () => Promise<void>;
  probeOllama: (url: string) => Promise<string>;
  pending: number;
  dismissed: string[];
  dismissTask: (id: string) => void;
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  conversation: {
    indexOpen: boolean;
    collapsed: boolean;
    contextOpen: boolean;
    contextHidden: boolean;
  };
  indexExpanded: boolean;
  contextExpanded: boolean;
  toggleConversationIndex: () => void;
  toggleConversationContext: () => void;
  closeConversationPopovers: () => void;
  toasts: ToastItem[];
  toast: (text: string, options?: { icon?: string; action?: ToastAction }) => void;
  dismissToast: (id: number) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  dialog: DialogRequest | null;
};

const SessionContext = createContext<Session | null>(null);

const EMPTY_STREAMS: Streams = { mic: null, cam: null, screen: null };

export function SessionProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<WebSettings>(loadSettings);
  const [aura, setAura] = useState<AuraState>('idle');
  const [streams, setStreams] = useState<Streams>(EMPTY_STREAMS);
  const [ollamaReady, setOllamaReady] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [conversation, setConversation] = useState({
    indexOpen: false,
    collapsed: false,
    contextOpen: false,
    contextHidden: false,
  });
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [account, setAccount] = useState<Account | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginError, setLoginError] = useState('');
  const loginWait = useRef<((ok: boolean) => void) | null>(null);
  const [dialog, setDialog] = useState<DialogRequest | null>(null);
  const dialogKey = useRef(0);
  const dialogResult = useRef<((ok: boolean) => void) | null>(null);
  const levelRef = useRef(0);
  const audioRef = useRef<{ context: AudioContext; frame: number } | null>(null);
  const toastId = useRef(0);

  const toast = useCallback((text: string, options?: { icon?: string; action?: ToastAction }) => {
    const id = ++toastId.current;
    setToasts((items) => [...items, { id, text, icon: options?.icon ?? 'circle-check', action: options?.action }]);
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), options?.action ? 5200 : 2800);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    dialogResult.current?.(false);
    return new Promise<boolean>((resolve) => {
      dialogResult.current = resolve;
      setDialog({ ...options, key: ++dialogKey.current });
    });
  }, []);

  const finishDialog = useCallback((ok: boolean) => {
    dialogResult.current?.(ok);
    dialogResult.current = null;
    setDialog(null);
  }, []);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    void currentAccount().then(setAccount);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const requireAccount = useCallback(() => {
    if (account) return Promise.resolve(true);
    setLoginError('');
    setLoginOpen(true);
    return new Promise<boolean>((resolve) => {
      loginWait.current = resolve;
    });
  }, [account]);

  const finishLogin = useCallback((ok: boolean) => {
    setLoginOpen(false);
    loginWait.current?.(ok);
    loginWait.current = null;
  }, []);

  const updateSettings = useCallback((patch: Partial<WebSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const stopAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    cancelAnimationFrame(audio.frame);
    void audio.context.close();
    audioRef.current = null;
    levelRef.current = 0;
  }, []);

  const stopKind = useCallback(
    (kind: Sensor) => {
      setStreams((current) => {
        current[kind]?.getTracks().forEach((track) => track.stop());
        return { ...current, [kind]: null };
      });
      if (kind === 'mic') stopAudio();
    },
    [stopAudio],
  );

  const stopSensing = useCallback(() => {
    (['mic', 'cam', 'screen'] as const).forEach((kind) => {
      setStreams((current) => {
        current[kind]?.getTracks().forEach((track) => track.stop());
        return current;
      });
    });
    stopAudio();
    setStreams(EMPTY_STREAMS);
    setAura('idle');
  }, [stopAudio]);

  const toggleSensor = useCallback(
    async (kind: Sensor): Promise<SensorResult> => {
      if (streams[kind]) {
        stopKind(kind);
        if (kind === 'mic') setAura('idle');
        return { ok: true, active: false };
      }
      try {
        const stream =
          kind === 'mic'
            ? await platform.requestMicrophone()
            : kind === 'cam'
              ? await platform.requestCamera()
              : await platform.requestScreenCapture();
        stream.getTracks().forEach((track) =>
          track.addEventListener('ended', () => {
            stopKind(kind);
            if (kind === 'mic') setAura('idle');
          }),
        );
        setStreams((current) => ({ ...current, [kind]: stream }));
        if (kind === 'mic') {
          setAura('listening');
          const context = new AudioContext();
          const analyser = context.createAnalyser();
          analyser.fftSize = 512;
          context.createMediaStreamSource(stream).connect(analyser);
          const data = new Uint8Array(analyser.fftSize);
          const pump = () => {
            analyser.getByteTimeDomainData(data);
            let sum = 0;
            for (const value of data) {
              const sample = (value - 128) / 128;
              sum += sample * sample;
            }
            levelRef.current = Math.min(1, Math.sqrt(sum / data.length) * 4);
            const frame = requestAnimationFrame(pump);
            if (audioRef.current) audioRef.current.frame = frame;
          };
          audioRef.current = { context, frame: 0 };
          pump();
        } else {
          setAura('vision');
          toast(kind === 'cam' ? '摄像头已开启。模型未接入，不会分析画面。' : '屏幕已共享。模型未接入，不会分析画面。');
        }
        return { ok: true, active: true };
      } catch (error) {
        const message = error instanceof PlatformCapabilityError ? error.message : '无法打开这一路感知';
        toast(message, { icon: 'circle-alert' });
        setAura('error');
        return { ok: false, message };
      }
    },
    [stopKind, streams, toast],
  );

  const toggleConversationIndex = useCallback(() => {
    setConversation((current) =>
      window.innerWidth < 1120
        ? { ...current, indexOpen: !current.indexOpen }
        : { ...current, collapsed: !current.collapsed },
    );
  }, []);

  const toggleConversationContext = useCallback(() => {
    setConversation((current) =>
      window.innerWidth < 1440
        ? { ...current, contextOpen: !current.contextOpen }
        : { ...current, contextHidden: !current.contextHidden },
    );
  }, []);

  const closeConversationPopovers = useCallback(() => {
    setConversation((current) => ({ ...current, indexOpen: false, contextOpen: false }));
  }, []);

  const indexExpanded = viewportWidth < 1120 ? conversation.indexOpen : !conversation.collapsed;
  const contextExpanded = viewportWidth < 1440 ? conversation.contextOpen : !conversation.contextHidden;

  const probeOllama = useCallback(async (url: string) => {
    if (account) {
      try {
        const result = await refreshOllama(url, 'qwen2.5:7b');
        setOllamaReady(result.ok);
        setOllamaModels(result.models);
        return result.message;
      } catch (error) {
        setOllamaReady(false);
        setOllamaModels([]);
        return error instanceof Error ? error.message : '没有连上 Ollama';
      }
    }
    try {
      const response = await fetch(new URL('/api/tags', url), { signal: AbortSignal.timeout(4000) });
      if (!response.ok) {
        setOllamaReady(false);
        setOllamaModels([]);
        return `没有连上，服务返回 ${response.status}。`;
      }
      const body = (await response.json()) as { models?: { name?: string }[] };
      const names = (body.models ?? []).map((item) => item.name).filter((name): name is string => Boolean(name));
      setOllamaModels(names);
      setOllamaReady(true);
      return names.length ? `已连接。这次探测成功，列出 ${names.length} 个模型。` : '已连接。这次探测成功，但没有列出模型。';
    } catch {
      setOllamaReady(false);
      setOllamaModels([]);
      return '没有连上。请确认 Ollama 已启动，并且地址允许网页访问。';
    }
  }, [account]);

  useEffect(() => {
    if (!account) return;
    void probeOllama(settings.ollamaUrl);
  }, [account, settings.ollamaUrl, probeOllama]);

  const logout = useCallback(async () => {
    await logoutAccount();
    setAccount(null);
    setOllamaReady(false);
    setOllamaModels([]);
  }, []);

  const dismissTask = useCallback((id: string) => {
    setDismissed((items) => (items.includes(id) ? items : [...items, id]));
    toast('这条演示已关闭。没有发送邮件，也没有移动文件。');
  }, [toast]);

  const pending = TASKS.filter((task) => task.status === 'wait' && !dismissed.includes(task.id)).length;
  const sensing = {
    mic: Boolean(streams.mic),
    cam: Boolean(streams.cam),
    screen: Boolean(streams.screen),
  };

  const value = useMemo<Session>(
    () => ({
      settings,
      updateSettings,
      aura,
      setAura,
      streams,
      sensing,
      levelRef,
      toggleSensor,
      stopSensing,
      ollamaReady,
      ollamaModels,
      account,
      requireAccount,
      logout,
      probeOllama,
      pending,
      dismissed,
      dismissTask,
      drawerOpen,
      setDrawerOpen,
      conversation,
      indexExpanded,
      contextExpanded,
      toggleConversationIndex,
      toggleConversationContext,
      closeConversationPopovers,
      toasts,
      toast,
      dismissToast: (id) => setToasts((items) => items.filter((item) => item.id !== id)),
      confirm,
      dialog,
    }),
    [
      settings,
      updateSettings,
      aura,
      streams,
      sensing,
      toggleSensor,
      stopSensing,
      ollamaReady,
      ollamaModels,
      account,
      requireAccount,
      logout,
      probeOllama,
      pending,
      dismissed,
      dismissTask,
      drawerOpen,
      conversation,
      indexExpanded,
      contextExpanded,
      toggleConversationIndex,
      toggleConversationContext,
      closeConversationPopovers,
      toasts,
      toast,
      confirm,
      dialog,
    ],
  );

  return (
    <SessionContext.Provider value={value}>
      {children}
      {dialog ? <ConfirmDialog key={dialog.key} request={dialog} onDone={finishDialog} /> : null}
      {loginOpen ? (
        <LoginDialog
          error={loginError}
          onClose={() => finishLogin(false)}
          onSubmit={(email, password) => {
            void loginAccount(email, password).then(
              (user) => {
                setAccount(user);
                setLoginError('');
                finishLogin(true);
              },
              (error: unknown) => setLoginError(error instanceof Error ? error.message : '邮箱或密码不正确'),
            );
          }}
        />
      ) : null}
    </SessionContext.Provider>
  );
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('会话状态尚未挂载');
  return session;
}
