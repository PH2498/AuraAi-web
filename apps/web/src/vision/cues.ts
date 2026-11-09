import { toneContext } from './playback';

let bed: { stop: () => void } | null = null;

function tone(ctx: AudioContext, frequency: number, when: number, duration: number, peak: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(frequency, when);
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), when + Math.min(0.03, duration * 0.3));
  gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(when);
  osc.stop(when + duration + 0.02);
}

export function playAnalyzeStart(): void {
  const ctx = toneContext();
  if (!ctx) return;
  try {
  playStart(ctx);
  } catch {
    // 音效失败时，分析照常进行。
  }
}

function playStart(ctx: AudioContext): void {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(340, now);
  osc.frequency.exponentialRampToValueAtTime(920, now + 0.2);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.1, now + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.28);
  tone(ctx, 460, now + 0.12, 0.18, 0.04);
}

export function startAnalyzeBed(): void {
  stopAnalyzeBed();
  const ctx = toneContext();
  if (!ctx) return;
  try {
  playBed(ctx);
  } catch {
    // 等待音效失败时，分析照常进行。
  }
}

function playBed(ctx: AudioContext): void {
  const drone = ctx.createGain();
  drone.gain.value = 0.0001;
  drone.connect(ctx.destination);
  const low = ctx.createOscillator();
  const high = ctx.createOscillator();
  low.type = 'sine';
  high.type = 'sine';
  low.frequency.value = 196;
  high.frequency.value = 294;
  low.connect(drone);
  high.connect(drone);
  const lfo = ctx.createOscillator();
  const depth = ctx.createGain();
  lfo.frequency.value = 1.35;
  depth.gain.value = 0.016;
  lfo.connect(depth);
  depth.connect(drone.gain);
  const now = ctx.currentTime;
  drone.gain.setValueAtTime(0.0001, now);
  drone.gain.exponentialRampToValueAtTime(0.045, now + 0.28);
  low.start(now);
  high.start(now);
  lfo.start(now);

  let stopped = false;
  let timer = 0;
  const pulse = () => {
    if (stopped) return;
    const at = ctx.currentTime;
    tone(ctx, 740, at, 0.09, 0.07);
    timer = window.setTimeout(pulse, 720);
  };
  timer = window.setTimeout(pulse, 260);

  const stop = () => {
    if (stopped) return;
    stopped = true;
    window.clearTimeout(timer);
    const at = ctx.currentTime;
    depth.gain.cancelScheduledValues(at);
    depth.gain.setValueAtTime(depth.gain.value, at);
    depth.gain.linearRampToValueAtTime(0, at + 0.1);
    drone.gain.cancelScheduledValues(at);
    const current = Math.max(drone.gain.value, 0.0001);
    drone.gain.setValueAtTime(current, at);
    drone.gain.exponentialRampToValueAtTime(0.0001, at + 0.12);
    window.setTimeout(() => {
      for (const osc of [low, high, lfo]) {
        try {
          osc.stop();
        } catch {
          // 已经停过。
        }
      }
    }, 160);
    if (bed?.stop === stop) bed = null;
  };
  bed = { stop };
}

export function stopAnalyzeBed(): void {
  const current = bed;
  bed = null;
  current?.stop();
}
