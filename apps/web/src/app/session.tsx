import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { createWebPlatform, PlatformCapabilityError } from '@aura/platform';
import { TASKS } from '../fixtures/content';
import { loadSettings, saveSettings, type AuraState, type WebSettings } from '../state/settings';

const platform = createWebPlatform();

type Sensor = 'mic' | 'cam' | 'screen';
type Streams = Record<Sensor, MediaStream | null>;

type ToastItem = { id: number; text: string };

type Session = {
  settings: WebSettings;
  updateSettings: (patch: Partial<WebSettings>) => void;
  aura: AuraState;
  setAura: (state: AuraState) => void;
  streams: Streams;
  sensing: Record<Sensor, boolean>;
  levelRef: RefObject<number>;
  toggleSensor: (kind: Sensor) => Promise<void>;
  stopSensing: () => void;
  ollamaReady: boolean;
  probeOllama: (url: string) => Promise<string>;
  pending: number;
  dismissed: string[];
  dismissTask: (id: string) => void;
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  toasts: ToastItem[];
  toast: (text: string) => void;
  dismissToast: (id: number) => void;
};

const SessionContext = createContext<Session | null>(null);

const EMPTY_STREAMS: Streams = { mic: null, cam: null, screen: null };

export function SessionProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<WebSettings>(loadSettings);
  const [aura, setAura] = useState<AuraState>('idle');
  const [streams, setStreams] = useState<Streams>(EMPTY_STREAMS);
  const [ollamaReady, setOllamaReady] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const levelRef = useRef(0);
  const audioRef = useRef<{ context: AudioContext; frame: number } | null>(null);
  const toastId = useRef(0);

  const toast = useCallback((text: string) => {
    const id = ++toastId.current;
    setToasts((items) => [...items, { id, text }]);
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 3200);
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
    async (kind: Sensor) => {
      if (streams[kind]) {
        stopKind(kind);
        if (kind === 'mic') setAura('idle');
        return;
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
      } catch (error) {
        setAura('error');
        toast(error instanceof PlatformCapabilityError ? error.message : '无法打开这一路感知');
      }
    },
    [stopKind, streams, toast],
  );

  const probeOllama = useCallback(async (url: string) => {
    try {
      const response = await fetch(new URL('/api/tags', url), { signal: AbortSignal.timeout(4000) });
      if (!response.ok) {
        setOllamaReady(false);
        return `没有连上，服务返回 ${response.status}。`;
      }
      setOllamaReady(true);
      return '已连接。这次探测成功。';
    } catch {
      setOllamaReady(false);
      return '没有连上。请确认 Ollama 已启动，并且地址允许网页访问。';
    }
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
      probeOllama,
      pending,
      dismissed,
      dismissTask,
      drawerOpen,
      setDrawerOpen,
      toasts,
      toast,
      dismissToast: (id) => setToasts((items) => items.filter((item) => item.id !== id)),
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
      probeOllama,
      pending,
      dismissed,
      dismissTask,
      drawerOpen,
      toasts,
      toast,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('会话状态尚未挂载');
  return session;
}
