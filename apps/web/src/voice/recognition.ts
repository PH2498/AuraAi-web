type SpeechResult = { isFinal: boolean; 0?: { transcript?: string } };
type SpeechEvent = { resultIndex: number; results: ArrayLike<SpeechResult> };

interface BrowserRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  processLocally?: boolean;
  onaudiostart: (() => void) | null;
  onresult: ((event: SpeechEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type RecognitionCtor = {
  new (): BrowserRecognition;
  available?: (options: { langs: string[]; processLocally: boolean }) => Promise<string>;
  install?: (options: { langs: string[]; processLocally: boolean }) => Promise<boolean>;
};

const LOCAL = { langs: ['zh-CN'], processLocally: true };

export function foldSpeechResults(results: ArrayLike<SpeechResult>): { finalText: string; interimText: string } {
  let finalText = '';
  let interimText = '';
  for (let index = 0; index < results.length; index += 1) {
    const piece = results[index]?.[0]?.transcript ?? '';
    if (!piece) continue;
    if (results[index]?.isFinal) finalText += piece;
    else interimText += piece;
  }
  return { finalText, interimText };
}

export function appendSpeech(base: string, spoken: string): string {
  const next = spoken.trim();
  if (!next) return base;
  if (!base.trim()) return next;
  if (/\s$/.test(base)) return `${base}${next}`;
  if (/[A-Za-z0-9]$/.test(base) && /^[A-Za-z0-9]/.test(next)) return `${base} ${next}`;
  return `${base}${next}`;
}

async function prefersLocal(Ctor: RecognitionCtor): Promise<boolean> {
  if (typeof Ctor.available !== 'function') return false;
  try {
    const status = await Promise.race([
      Ctor.available(LOCAL),
      new Promise<string>((resolve) => window.setTimeout(() => resolve('timeout'), 800)),
    ]);
    if (status === 'available') return true;
    if ((status === 'downloadable' || status === 'downloading') && typeof Ctor.install === 'function') {
      void Ctor.install(LOCAL).catch(() => undefined);
    }
  } catch {
    return false;
  }
  return false;
}

export function startBrowserRecognition(handlers: {
  onText: (finalText: string, interimText: string) => void;
  onSegment?: () => void;
  onAudioStart?: () => void;
  onError: (code: string) => void;
  onEnd: () => void;
}): { stop: () => void } | null {
  const host = window as Window & { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  const Ctor = host.SpeechRecognition ?? host.webkitSpeechRecognition;
  if (!Ctor) return null;
  const recognition = new Ctor();
  let stopped = false;
  let captureFails = 0;
  recognition.lang = 'zh-CN';
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.onaudiostart = () => handlers.onAudioStart?.();
  recognition.onresult = (event) => {
    const spoken = foldSpeechResults(event.results);
    if (spoken.finalText || spoken.interimText) handlers.onText(spoken.finalText, spoken.interimText);
  };
  recognition.onerror = (event) => {
    if (event.error === 'audio-capture') {
      captureFails += 1;
      if (captureFails >= 2) {
        stopped = true;
        handlers.onError(event.error);
      }
      return;
    }
    handlers.onError(event.error);
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed' || event.error === 'network') stopped = true;
  };
  recognition.onend = () => {
    handlers.onSegment?.();
    if (stopped) {
      handlers.onEnd();
      return;
    }
    window.setTimeout(() => {
      if (stopped) return;
      try {
        recognition.start();
      } catch {
        // 上一次还没完全停下来时，等它自己的 onend 再开始。
      }
    }, 250);
  };
  void (async () => {
    const local = await prefersLocal(Ctor);
    if (stopped) return;
    if (local) recognition.processLocally = true;
    try {
      recognition.start();
    } catch {
      handlers.onError('aborted');
    }
  })();
  return {
    stop() {
      stopped = true;
      try {
        recognition.stop();
      } catch {
        // 已经结束。
      }
    },
  };
}
