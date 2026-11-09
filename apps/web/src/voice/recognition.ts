type SpeechResult = { isFinal: boolean; 0: { transcript: string } };
type SpeechEvent = { resultIndex: number; results: ArrayLike<SpeechResult> };

interface BrowserRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onaudiostart: (() => void) | null;
  onresult: ((event: SpeechEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type RecognitionCtor = new () => BrowserRecognition;

export function startBrowserRecognition(handlers: {
  onText: (text: string, final: boolean) => void;
  onAudioStart?: () => void;
  onError: (code: string) => boolean | void;
  onEnd: () => void;
}): { stop: () => void; restart: () => void } | null {
  const host = window as Window & { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  const Ctor = host.SpeechRecognition ?? host.webkitSpeechRecognition;
  if (!Ctor) return null;
  const recognition = new Ctor();
  let stopped = false;
  recognition.lang = 'zh-CN';
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.onaudiostart = () => handlers.onAudioStart?.();
  recognition.onresult = (event) => {
    let text = '';
    let final = false;
    for (let index = 0; index < event.results.length; index += 1) {
      text += event.results[index][0]?.transcript ?? '';
      if (event.results[index].isFinal) final = true;
    }
    const spoken = text.trim();
    if (spoken) handlers.onText(spoken, final);
  };
  recognition.onerror = (event) => {
    const retry = handlers.onError(event.error) === true;
    const blocked = event.error === 'not-allowed' || event.error === 'service-not-allowed' || event.error === 'network';
    if (blocked || (event.error === 'audio-capture' && !retry)) stopped = true;
  };
  recognition.onend = () => {
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
  try {
    recognition.start();
  } catch {
    handlers.onError('aborted');
  }
  return {
    stop() {
      stopped = true;
      try {
        recognition.stop();
      } catch {
        // 已经结束。
      }
    },
    restart() {
      try {
        recognition.stop();
      } catch {
        // 已经结束，等 onend 再开始。
      }
    },
  };
}
