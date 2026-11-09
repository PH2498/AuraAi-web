let context: AudioContext | null = null;
let playing: AudioBufferSourceNode | null = null;

export function unlockSpeech(): void {
  const Ctx = window.AudioContext;
  if (!Ctx) return;
  if (!context || context.state === 'closed') context = new Ctx();
  if (context.state === 'suspended') void context.resume();
}

export function stopSpeech(): void {
  const source = playing;
  playing = null;
  try {
    source?.stop();
  } catch {
    // 已经播完时再停一次会抛错，可以忽略。
  }
}

export async function playWav(bytes: ArrayBuffer): Promise<void> {
  unlockSpeech();
  const ctx = context;
  if (!ctx) throw new Error('这台浏览器不能播放声音');
  await ctx.resume();
  const buffer = await ctx.decodeAudioData(bytes.slice(0));
  stopSpeech();
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  playing = source;
  await new Promise<void>((resolve) => {
    source.onended = () => {
      if (playing === source) playing = null;
      resolve();
    };
    source.start();
  });
}
