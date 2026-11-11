import { toneContext } from './playback';

let bed: { stop: () => void } | null = null;

const NOTES = [196, 247, 220, 174];

function warm(ctx: AudioContext): BiquadFilterNode {
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 340;
  filter.Q.value = 0.4;
  return filter;
}

function soft(ctx: AudioContext, frequency: number, when: number, duration: number, peak: number) {
  const osc = ctx.createOscillator();
  const filter = warm(ctx);
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(frequency, when);
  osc.frequency.linearRampToValueAtTime(frequency * 1.02, when + duration * 0.45);
  osc.frequency.linearRampToValueAtTime(frequency * 0.99, when + duration);
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), when + 0.16);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  osc.connect(filter);
  filter.connect(gain);
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
  soft(ctx, 174, now, 0.72, 0.04);
  soft(ctx, 220, now + 0.36, 0.64, 0.028);
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
  const filter = warm(ctx);
  const drone = ctx.createGain();
  drone.gain.value = 0.0001;
  drone.connect(filter);
  filter.connect(ctx.destination);
  const low = ctx.createOscillator();
  low.type = 'sine';
  low.frequency.value = 147;
  low.connect(drone);
  const lfo = ctx.createOscillator();
  const depth = ctx.createGain();
  lfo.frequency.value = 0.22;
  depth.gain.value = 0.006;
  lfo.connect(depth);
  depth.connect(drone.gain);
  const now = ctx.currentTime;
  drone.gain.setValueAtTime(0.0001, now);
  drone.gain.exponentialRampToValueAtTime(0.022, now + 0.45);
  low.start(now);
  lfo.start(now);

  let stopped = false;
  let step = 0;
  let timer = 0;
  const phrase = () => {
    if (stopped) return;
    const note = NOTES[step % NOTES.length] ?? 196;
    const accent = step % 2 === 0 ? 0.04 : 0.026;
    soft(ctx, note, ctx.currentTime + 0.02, 0.78, accent);
    step += 1;
    timer = window.setTimeout(phrase, 860);
  };
  timer = window.setTimeout(phrase, 240);

  const stop = () => {
    if (stopped) return;
    stopped = true;
    window.clearTimeout(timer);
    const at = ctx.currentTime;
    depth.gain.cancelScheduledValues(at);
    depth.gain.setValueAtTime(depth.gain.value, at);
    depth.gain.linearRampToValueAtTime(0, at + 0.18);
    drone.gain.cancelScheduledValues(at);
    const current = Math.max(drone.gain.value, 0.0001);
    drone.gain.setValueAtTime(current, at);
    drone.gain.exponentialRampToValueAtTime(0.0001, at + 0.36);
    window.setTimeout(() => {
      for (const osc of [low, lfo]) {
        try {
          osc.stop();
        } catch {
          // 已经停过。
        }
      }
    }, 420);
    if (bed?.stop === stop) bed = null;
  };
  bed = { stop };
}

export function stopAnalyzeBed(): void {
  const current = bed;
  bed = null;
  current?.stop();
}
