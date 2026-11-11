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
import { currentAccount, listProviders, loginAccount, logoutAccount, refreshOllama, testProvider, type Account } from '../chat/api';
import { isVisionModelName, localRef, type CloudEndpoint, type CloudProbe } from '../state/models';
import { loadSettings, saveSettings, type AuraState, type WebSettings } from '../state/settings';
import { listMemories } from '../memory/api';
import { encodeWav } from '../voice/wav';
import { frameFromStream } from '../vision/api';
import { listTasks } from '../tasks/api';

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
  dictating: boolean;
  levelRef: RefObject<number>;
  toggleSensor: (kind: Sensor) => Promise<SensorResult>;
  captureScreenFrame: () => Promise<Blob>;
  toggleDictation: () => void;
  startVoiceMeter: () => void;
  stopSensing: () => void;
  ollamaReady: boolean;
  ollamaModels: string[];
  endpoints: CloudEndpoint[];
  cloudProbes: Record<string, CloudProbe>;
  noteCloudProbe: (id: string, result: CloudProbe | null) => void;
  reloadEndpoints: () => Promise<void>;
  account: Account | null;
  accountKnown: boolean;
  requireAccount: () => Promise<boolean>;
  logout: () => Promise<void>;
  probeOllama: (url: string) => Promise<string>;
  pending: number;
  memoryPending: number;
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
  const [dictating, setDictating] = useState(false);
  const dictatingRef = useRef(false);
  dictatingRef.current = dictating;
  const auraRef = useRef(aura);
  auraRef.current = aura;
  const [ollamaReady, setOllamaReady] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [endpoints, setEndpoints] = useState<CloudEndpoint[]>([]);
  const [cloudProbes, setCloudProbes] = useState<Record<string, CloudProbe>>({});
  const cloudProbeRef = useRef<Record<string, CloudProbe | 'pending'>>({});
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
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
  const [accountKnown, setAccountKnown] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginError, setLoginError] = useState('');
  const loginWait = useRef<((ok: boolean) => void) | null>(null);
  const [dialog, setDialog] = useState<DialogRequest | null>(null);
  const dialogKey = useRef(0);
  const dialogResult = useRef<((ok: boolean) => void) | null>(null);
  const levelRef = useRef(0);
  const audioRef = useRef<{ context: AudioContext; frame: number; stream?: MediaStream } | null>(null);
  const meterStarting = useRef(false);
  const meterContext = useRef<AudioContext | null>(null);
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
    void currentAccount()
      .then(setAccount)
      .finally(() => setAccountKnown(true));
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
    audio.stream?.getTracks().forEach((track) => track.stop());
    void audio.context.close();
    audioRef.current = null;
    levelRef.current = 0;
  }, []);

  const closeMeterContext = useCallback(() => {
    const context = meterContext.current;
    meterContext.current = null;
    if (context && context.state !== 'closed') void context.close();
  }, []);

  const startVoiceMeter = useCallback(() => {
    if (!dictatingRef.current || audioRef.current || meterStarting.current) return;
    meterStarting.current = true;
    void (async () => {
      if (!dictatingRef.current || audioRef.current) {
        meterStarting.current = false;
        return;
      }
      const deviceId = settingsRef.current.micDevice;
      const audio: MediaTrackConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false,
        channelCount: 1,
      };
      if (deviceId) audio.deviceId = { ideal: deviceId };
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio, video: false });
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        } catch {
          meterStarting.current = false;
          closeMeterContext();
          return;
        }
      }
      if (!dictatingRef.current || audioRef.current) {
        meterStarting.current = false;
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const context = meterContext.current ?? new AudioContext({ latencyHint: 'interactive' });
      meterContext.current = null;
      await context.resume().catch(() => undefined);
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0;
      const source = context.createMediaStreamSource(stream);
      source.connect(analyser);
      const mute = context.createGain();
      mute.gain.value = 0;
      const processor = context.createScriptProcessor(4096, 1, 1);
      const samples: Float32Array[] = [];
      processor.onaudioprocess = (event) => {
        samples.push(new Float32Array(event.inputBuffer.getChannelData(0)));
      };
      source.connect(processor);
      processor.connect(mute);
      mute.connect(context.destination);
      const data = new Float32Array(analyser.fftSize);
      let last = performance.now();
      let envelope = 0;
      let speakingFor = 0;
      let quietFor = 0;
      let voiced = false;
      const finishUtterance = () => {
        if (!samples.length) return;
        const taken = samples.splice(0);
        const blob = encodeWav(taken, context.sampleRate);
        if (blob.size > 8_000) window.dispatchEvent(new CustomEvent('aura-utterance', { detail: blob }));
      };
      const pump = (now: number) => {
        if (!dictatingRef.current) {
          if (voiced) finishUtterance();
          processor.disconnect();
          mute.disconnect();
          stopAudio();
          return;
        }
        analyser.getFloatTimeDomainData(data);
        let sum = 0;
        for (const sample of data) sum += sample * sample;
        const rms = Math.sqrt(sum / data.length);
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        const target = Math.min(1, Math.max(0, (rms - 0.004) / 0.05));
        const tau = target > envelope ? 0.02 : 0.14;
        envelope += (target - envelope) * (1 - Math.exp(-dt / tau));
        levelRef.current = envelope;
        if (rms > 0.015) {
          speakingFor += dt;
          quietFor = 0;
          if (speakingFor > 0.28) voiced = true;
        } else if (voiced) {
          quietFor += dt;
          if (quietFor > 0.38) {
            voiced = false;
            speakingFor = 0;
            quietFor = 0;
            finishUtterance();
          }
        } else {
          speakingFor = 0;
          let count = 0;
          for (const chunk of samples) count += chunk.length;
          const keep = context.sampleRate * 0.35;
          while (count > keep && samples.length > 1) count -= samples.shift()?.length ?? 0;
        }
        const frame = requestAnimationFrame(pump);
        if (audioRef.current) audioRef.current.frame = frame;
      };
      audioRef.current = { context, frame: 0, stream };
      meterStarting.current = false;
      pump(performance.now());
    })();
  }, [stopAudio, closeMeterContext]);

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
    closeMeterContext();
    setStreams(EMPTY_STREAMS);
    dictatingRef.current = false;
    setDictating(false);
    meterStarting.current = false;
    setAura('idle');
  }, [stopAudio, closeMeterContext]);

  const toggleSensor = useCallback(
    async (kind: Sensor): Promise<SensorResult> => {
      if (streams[kind]) {
        stopKind(kind);
        const visionStillOn = (kind !== 'cam' && Boolean(streams.cam)) || (kind !== 'screen' && Boolean(streams.screen));
        const micStillOn = (kind !== 'mic' && Boolean(streams.mic)) || dictatingRef.current;
        if (auraRef.current === 'vision' || auraRef.current === 'listening') {
          setAura(visionStillOn ? 'vision' : micStillOn ? 'listening' : 'idle');
        }
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
            setStreams((current) => {
              current[kind]?.getTracks().forEach((item) => item.stop());
              const next = { ...current, [kind]: null };
              const visionStillOn = Boolean(next.cam || next.screen);
              const micStillOn = Boolean(next.mic) || dictatingRef.current;
              if ((auraRef.current === 'vision' || auraRef.current === 'listening') && kind !== 'mic') {
                setAura(visionStillOn ? 'vision' : micStillOn ? 'listening' : 'idle');
              } else if (kind === 'mic' && !dictatingRef.current && auraRef.current === 'listening') {
                setAura(visionStillOn ? 'vision' : 'idle');
              }
              return next;
            });
            if (kind === 'mic') stopAudio();
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
          toast(kind === 'cam' ? '摄像头已开启。拍下后再发送，这一帧会保存在这次对话里。' : '屏幕保持共享。发送消息时会附上当前画面，手动关闭后才会停止。');
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

  const captureScreenFrame = useCallback(async () => {
    const existing = streams.screen;
    if (existing) return frameFromStream(existing);
    const stream = await platform.requestScreenCapture();
    try {
      return await frameFromStream(stream);
    } finally {
      stream.getTracks().forEach((track) => track.stop());
    }
  }, [streams.screen]);

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

  const adoptListedModels = useCallback((names: string[]) => {
    const current = settingsRef.current;
    const patch: Partial<WebSettings> = {};
    if (!current.chatModel && names[0]) patch.chatModel = localRef(names[0]);
    if (!current.visionModel) {
      const vision = names.find(isVisionModelName);
      if (vision) patch.visionModel = localRef(vision);
    }
    if (patch.chatModel || patch.visionModel) updateSettings(patch);
  }, [updateSettings]);

  const probeOllama = useCallback(async (url: string) => {
    if (account) {
      try {
        const result = await refreshOllama(url);
        setOllamaReady(result.ok);
        setOllamaModels(result.models);
        if (result.ok) adoptListedModels(result.models);
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
      adoptListedModels(names);
      return names.length ? `已连接。这次探测成功，列出 ${names.length} 个模型。` : '已连接。这次探测成功，但没有列出模型。';
    } catch {
      setOllamaReady(false);
      setOllamaModels([]);
      return '没有连上。请确认 Ollama 已启动，并且地址允许网页访问。';
    }
  }, [account, adoptListedModels]);

  useEffect(() => {
    if (!account) return;
    void probeOllama(settings.ollamaUrl);
  }, [account, settings.ollamaUrl, probeOllama]);

  const noteCloudProbe = useCallback((id: string, result: CloudProbe | null) => {
    if (result === null) {
      delete cloudProbeRef.current[id];
      setCloudProbes((current) => {
        if (!(id in current)) return current;
        const next = { ...current };
        delete next[id];
        return next;
      });
      return;
    }
    cloudProbeRef.current[id] = result;
    setCloudProbes((current) => (current[id] === result ? current : { ...current, [id]: result }));
  }, []);

  const reloadEndpoints = useCallback(async () => {
    if (!account) {
      setEndpoints([]);
      return;
    }
    const rows = await listProviders().catch(() => []);
    setEndpoints(rows.filter((item) => item.provider === 'openai' && item.enabled));
  }, [account]);

  useEffect(() => {
    void reloadEndpoints();
  }, [reloadEndpoints]);

  useEffect(() => {
    if (!account) return;
    let stop = false;
    for (const item of endpoints) {
      if (!item.keyConfigured || !item.defaultModel || cloudProbeRef.current[item.id]) continue;
      cloudProbeRef.current[item.id] = 'pending';
      void testProvider(item.id).then(
        (result) => {
          if (!stop) noteCloudProbe(item.id, result.ok ? 'ok' : 'fail');
        },
        () => {
          if (!stop) noteCloudProbe(item.id, 'fail');
        },
      );
    }
    return () => {
      stop = true;
      for (const item of endpoints) {
        if (cloudProbeRef.current[item.id] === 'pending') delete cloudProbeRef.current[item.id];
      }
    };
  }, [account, endpoints, noteCloudProbe]);

  const logout = useCallback(async () => {
    await logoutAccount();
    setAccount(null);
    setOllamaReady(false);
    setOllamaModels([]);
    setEndpoints([]);
    cloudProbeRef.current = {};
    setCloudProbes({});
  }, []);

  const dismissTask = useCallback((id: string) => {
    setDismissed((items) => (items.includes(id) ? items : [...items, id]));
    toast('这条演示已关闭。没有发送邮件，也没有移动文件。');
  }, [toast]);

  const [taskPending, setTaskPending] = useState(0);
  useEffect(() => {
    if (!accountKnown) return;
    if (!account) {
      setTaskPending(0);
      return;
    }
    let stop = false;
    const pull = () => {
      void listTasks()
        .then((tasks) => {
          if (!stop) setTaskPending(tasks.filter((task) => task.status === 'waiting_confirmation').length);
        })
        .catch(() => undefined);
    };
    pull();
    const timer = window.setInterval(pull, 5000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [account, accountKnown]);
  const pending = taskPending;
  const [memoryPending, setMemoryPending] = useState(0);
  useEffect(() => {
    if (!accountKnown) return;
    if (!account) {
      setMemoryPending(0);
      return;
    }
    let stop = false;
    let timer = 0;
    const pull = () => {
      void listMemories()
        .then((rows) => {
          if (!stop) setMemoryPending(rows.filter((item) => item.status === 'pending').length);
        })
        .catch(() => undefined);
    };
    const soon = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(pull, 40);
    };
    pull();
    const interval = window.setInterval(pull, 5000);
    window.addEventListener('aura-memories', soon);
    return () => {
      stop = true;
      window.clearTimeout(timer);
      window.clearInterval(interval);
      window.removeEventListener('aura-memories', soon);
    };
  }, [account, accountKnown]);
  const toggleDictation = useCallback(() => {
    const next = !dictatingRef.current;
    dictatingRef.current = next;
    setDictating(next);
    if (next) {
      setStreams((current) => {
        current.mic?.getTracks().forEach((track) => track.stop());
        return current.mic ? { ...current, mic: null } : current;
      });
      stopAudio();
      closeMeterContext();
      meterStarting.current = false;
      const context = new AudioContext({ latencyHint: 'interactive' });
      void context.resume();
      meterContext.current = context;
      setAura('listening');
      startVoiceMeter();
    } else {
      stopAudio();
      closeMeterContext();
      meterStarting.current = false;
      setAura((current) => (current === 'listening' ? 'idle' : current));
    }
  }, [stopAudio, closeMeterContext, startVoiceMeter]);

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
      dictating,
      levelRef,
      toggleSensor,
      captureScreenFrame,
      toggleDictation,
      startVoiceMeter,
      stopSensing,
      ollamaReady,
      ollamaModels,
      endpoints,
      cloudProbes,
      noteCloudProbe,
      reloadEndpoints,
      account,
      accountKnown,
      requireAccount,
      logout,
      probeOllama,
      pending,
      memoryPending,
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
      dictating,
      toggleSensor,
      captureScreenFrame,
      toggleDictation,
      startVoiceMeter,
      stopSensing,
      ollamaReady,
      ollamaModels,
      endpoints,
      cloudProbes,
      noteCloudProbe,
      reloadEndpoints,
      account,
      accountKnown,
      requireAccount,
      logout,
      probeOllama,
      pending,
      memoryPending,
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
