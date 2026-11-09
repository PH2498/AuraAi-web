let context: AudioContext | null = null;
let playing: { stop: () => void } | null = null;

export function unlockSpeech(): void {
  const Ctx = window.AudioContext;
  if (!Ctx) return;
  if (!context || context.state === 'closed') context = new Ctx();
  if (context.state === 'suspended') void context.resume();
}

export function toneContext(): AudioContext | null {
  unlockSpeech();
  return context;
}

export function stopSpeech(): void {
  const current = playing;
  playing = null;
  current?.stop();
}

export async function playWav(bytes: ArrayBuffer, onLevel?: (level: number) => void): Promise<void> {
  unlockSpeech();
  const ctx = context;
  if (!ctx) throw new Error('这台浏览器不能播放声音');
  await ctx.resume();
  const buffer = await ctx.decodeAudioData(bytes.slice(0));
  stopSpeech();
  const source = ctx.createBufferSource();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  source.buffer = buffer;
  source.connect(analyser);
  analyser.connect(ctx.destination);
  const samples = new Float32Array(analyser.fftSize);
  let smooth = 0;
  let frame = 0;
  let settled = false;
  let timer = 0;

  await new Promise<void>((resolve) => {
    const finish = () => {
      if (settled) return;
      settled = true;
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      if (playing?.stop === stop) playing = null;
      try {
        source.stop();
      } catch {
        // 播完后再停会抛错。
      }
      onLevel?.(0);
      resolve();
    };
    const stop = () => finish();
    const pump = () => {
      if (settled) return;
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) sum += sample * sample;
      const level = Math.min(1, Math.sqrt(sum / samples.length) * 3.4);
      smooth += (level - smooth) * 0.35;
      onLevel?.(smooth);
      frame = window.requestAnimationFrame(pump);
    };
    playing = { stop };
    source.onended = finish;
    timer = window.setTimeout(finish, (buffer.duration + 0.35) * 1000);
    source.start();
    pump();
  });
}
