export type PlatformKind = 'web' | 'desktop';

export type PlatformCapabilityCode = 'MEDIA_UNSUPPORTED' | 'MEDIA_PERMISSION_DENIED';

export class PlatformCapabilityError extends Error {
  readonly code: PlatformCapabilityCode;

  constructor(code: PlatformCapabilityCode, message: string) {
    super(message);
    this.name = 'PlatformCapabilityError';
    this.code = code;
  }
}

export interface PlatformAdapter {
  readonly kind: PlatformKind;
  requestCamera(): Promise<MediaStream>;
  requestMicrophone(): Promise<MediaStream>;
  requestScreenCapture(): Promise<MediaStream>;
  notify(input: { title: string; body: string }): Promise<void>;
  openExternal(url: string): Promise<void>;
}

interface FocusController {
  setFocusBehavior(behavior: 'no-focus-change'): void;
}

interface FocusControllerConstructor {
  new (): FocusController;
}

interface DisplayMediaOptions {
  audio?: boolean;
  video?: boolean;
  controller?: FocusController;
}

interface MediaDeviceHost {
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  getDisplayMedia?: (options: DisplayMediaOptions) => Promise<MediaStream>;
}

interface NotificationHost {
  permission: NotificationPermission;
  requestPermission?: () => Promise<NotificationPermission>;
  new (title: string, options?: NotificationOptions): Notification;
}

export interface PlatformHost {
  navigator: { mediaDevices?: MediaDeviceHost };
  CaptureController?: FocusControllerConstructor;
  Notification?: NotificationHost;
  open?: (url: string) => void;
}

export function createWebPlatform(host: PlatformHost = defaultHost()): PlatformAdapter {
  return {
    kind: 'web',
    requestCamera: () => requestStream(host, 'camera'),
    requestMicrophone: () => requestStream(host, 'microphone'),
    requestScreenCapture: () => requestStream(host, 'screen'),
    notify: (input) => notify(host, input),
    openExternal: (url) => openExternal(host, url),
  };
}

function defaultHost(): PlatformHost {
  if (typeof window === 'undefined') {
    return { navigator: {} };
  }

  const capture = window as Window & { CaptureController?: FocusControllerConstructor };
  return {
    navigator: window.navigator,
    CaptureController: capture.CaptureController,
    Notification: window.Notification,
    open: (url) => {
      window.open(url, '_blank', 'noopener,noreferrer');
    },
  };
}

async function requestStream(
  host: PlatformHost,
  kind: 'camera' | 'microphone' | 'screen',
): Promise<MediaStream> {
  const devices = host.navigator.mediaDevices;
  if (kind === 'screen') {
    const request = devices?.getDisplayMedia?.bind(devices);
    if (!request) throw new PlatformCapabilityError('MEDIA_UNSUPPORTED', unsupportedMessage(kind));
    return captureScreen(host, request);
  }

  const request = devices?.getUserMedia?.bind(devices);
  if (!request) throw new PlatformCapabilityError('MEDIA_UNSUPPORTED', unsupportedMessage(kind));

  const constraints: MediaStreamConstraints =
    kind === 'microphone' ? { audio: true, video: false } : { audio: false, video: true };

  return mapMediaError(kind, request(constraints));
}

async function captureScreen(
  host: PlatformHost,
  request: (options: DisplayMediaOptions) => Promise<MediaStream>,
): Promise<MediaStream> {
  const Controller = host.CaptureController;
  const options: DisplayMediaOptions = { audio: false, video: true };
  if (!Controller) return mapMediaError('screen', request(options));

  const controller = new Controller();
  options.controller = controller;
  const pending = request(options);
  try {
    controller.setFocusBehavior('no-focus-change');
  } catch {
    // 浏览器若不允许提前指定焦点，共享仍然继续。
  }
  return mapMediaError('screen', pending);
}

function mapMediaError(
  kind: 'camera' | 'microphone' | 'screen',
  pending: Promise<MediaStream>,
): Promise<MediaStream> {
  return pending.catch((error: unknown) => {
    if (isDenied(error)) {
      throw new PlatformCapabilityError('MEDIA_PERMISSION_DENIED', deniedMessage(kind));
    }
    throw new PlatformCapabilityError('MEDIA_UNSUPPORTED', unsupportedMessage(kind));
  });
}

async function notify(host: PlatformHost, input: { title: string; body: string }): Promise<void> {
  const NotificationApi = host.Notification;
  if (!NotificationApi) {
    throw new PlatformCapabilityError('MEDIA_UNSUPPORTED', '当前环境不支持系统通知');
  }

  let permission = NotificationApi.permission;
  if (permission === 'default' && NotificationApi.requestPermission) {
    permission = await NotificationApi.requestPermission();
  }
  if (permission !== 'granted') {
    throw new PlatformCapabilityError('MEDIA_PERMISSION_DENIED', '通知权限被拒绝');
  }

  new NotificationApi(input.title, { body: input.body });
}

function openExternal(host: PlatformHost, url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return Promise.reject(new PlatformCapabilityError('MEDIA_UNSUPPORTED', '无法打开链接'));
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return Promise.reject(new PlatformCapabilityError('MEDIA_UNSUPPORTED', '无法打开链接'));
  }
  if (!host.open) {
    return Promise.reject(
      new PlatformCapabilityError('MEDIA_UNSUPPORTED', '当前环境无法打开外部链接'),
    );
  }

  host.open(parsed.toString());
  return Promise.resolve();
}

function isDenied(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError')
  );
}

function unsupportedMessage(kind: 'camera' | 'microphone' | 'screen'): string {
  if (kind === 'camera') return '当前环境不支持摄像头';
  if (kind === 'microphone') return '当前环境不支持麦克风';
  return '当前环境不支持屏幕共享';
}

function deniedMessage(kind: 'camera' | 'microphone' | 'screen'): string {
  if (kind === 'camera') return '摄像头权限被拒绝';
  if (kind === 'microphone') return '麦克风权限被拒绝';
  return '屏幕共享被拒绝';
}
