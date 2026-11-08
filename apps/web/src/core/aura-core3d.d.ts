export type AuraState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'vision'
  | 'executing'
  | 'error';

export class AuraCore3D {
  static supported(): boolean;
  constructor(canvas: HTMLCanvasElement, opts?: Record<string, unknown>);
  reduced: boolean;
  fps: number;
  quality: string;
  dust?: { visible: boolean };
  setQuality(level: 'auto' | 'high' | 'low'): void;
  setState(name: AuraState): void;
  setLevel(value: number): void;
  setAmplitude(value: number): void;
  setProgress(value: number): void;
  setHover(on: boolean): void;
  setPressed(on: boolean): void;
  drag(dx: number, dy: number): void;
  pulse(): void;
  setFrame(frame: { cx: number; cy: number; r: number }, snap?: boolean): void;
  center(): { x: number; y: number; r: number };
  onFrame(fn: (event?: { lost?: boolean; quality?: string }) => void): () => void;
  destroy(): void;
}
