import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { AuraCore3D, type AuraState } from '../../core/aura-core3d.js';

type CoreApi = {
  setState: (state: AuraState) => void;
  setLevel: (value: number) => void;
  setHover: (on: boolean) => void;
  setPressed: (on: boolean) => void;
  drag: (dx: number, dy: number) => void;
  pulse: () => void;
  bindSlot: (element: HTMLElement | null) => void;
};

const CoreContext = createContext<CoreApi | null>(null);

export function CoreProvider({
  state,
  reduced,
  dust,
  levelRef,
  children,
}: {
  state: AuraState;
  reduced: boolean;
  dust: boolean;
  levelRef?: RefObject<number>;
  children: ReactNode;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const coreRef = useRef<AuraCore3D | null>(null);
  const slotRef = useRef<HTMLElement | null>(null);
  const apiRef = useRef<CoreApi>(null!);
  const levelHolder = useRef(levelRef);
  levelHolder.current = levelRef;
  if (!apiRef.current) {
    apiRef.current = {
      setState: (next) => coreRef.current?.setState(next),
      setLevel: (value) => coreRef.current?.setLevel(value),
      setHover: (on) => coreRef.current?.setHover(on),
      setPressed: (on) => coreRef.current?.setPressed(on),
      drag: (dx, dy) => coreRef.current?.drag(dx, dy),
      pulse: () => coreRef.current?.pulse(),
      bindSlot: (element) => {
        slotRef.current = element;
      },
    };
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let core: AuraCore3D;
    try {
      if (!AuraCore3D.supported()) throw new Error('no webgl2');
      core = new AuraCore3D(canvas, { particles: 3600, dust: 520, quality: 'auto' });
      document.body.classList.remove('no-webgl');
    } catch {
      document.body.classList.add('no-webgl');
      return;
    }
    coreRef.current = core;
    let lastHit = 0;
    const stop = core.onFrame((event) => {
      if (event?.lost) {
        document.body.classList.add('no-webgl');
        return;
      }
      const slot = slotRef.current;
      if (!slot) return;
      const rect = slot.getBoundingClientRect();
      if (!rect.width) return;
      const anchor = slot.closest('.core-anchor');
      if (anchor instanceof HTMLElement && document.body.dataset.page === 'home') {
        const box = anchor.getBoundingClientRect();
        if (!box.height) return;
        const reading = document.body.classList.contains('reading');
        const fit = Math.min(box.height / 2, box.width / 2.3);
        const grow = reading ? 1 : 1.72;
        const radius = Math.max(40, Math.min(fit * grow, box.width / 2.1, (box.width - 440) / 1.7));
        core.setFrame({
          cx: box.left + box.width / 2,
          cy: box.top + box.height / 2,
          r: radius,
        });
        const hit = Math.round((radius / 2.7) * 2.3);
        if (hit !== lastHit) {
          anchor.style.setProperty('--hit', `${hit}px`);
          lastHit = hit;
        }
      } else {
        core.setFrame({
          cx: rect.left + rect.width / 2,
          cy: rect.top + rect.height / 2,
          r: Math.min(rect.width, rect.height) / 2,
        });
      }
      core.setLevel(levelHolder.current?.current ?? 0);
      const center = core.center();
      const veil = document.querySelector<HTMLElement>('.page-veil');
      veil?.style.setProperty('--cx', `${center.x}px`);
      veil?.style.setProperty('--cy', `${center.y}px`);
      veil?.style.setProperty('--cr', `${center.r}px`);
    });
    return () => {
      stop();
      core.destroy();
      coreRef.current = null;
    };
  }, []);

  useEffect(() => {
    coreRef.current?.setState(state);
  }, [state]);

  useEffect(() => {
    const core = coreRef.current;
    if (!core) return;
    core.reduced = reduced;
    if (core.dust) core.dust.visible = dust;
  }, [reduced, dust]);

  return (
    <CoreContext.Provider value={apiRef.current}>
      <canvas ref={canvasRef} className="stage" aria-hidden="true" />
      <div className="stage-fallback" aria-hidden="true" />
      <div className="page-veil veil" aria-hidden="true" />
      {children}
    </CoreContext.Provider>
  );
}

export function useCore(): CoreApi {
  const api = useContext(CoreContext);
  if (!api) throw new Error('Core 尚未挂载');
  return api;
}

export function useCoreSlot<T extends HTMLElement>(active = true): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  const { bindSlot } = useCore();
  useLayoutEffect(() => {
    if (!active) return;
    bindSlot(ref.current);
    return () => bindSlot(null);
  }, [active, bindSlot]);
  return ref;
}

export function useCorePointer(onActivate?: () => void) {
  const core = useCore();
  const drag = useRef<{ x: number; y: number; moved: number } | null>(null);
  const swallow = useRef(false);
  const activate = useRef(onActivate);
  activate.current = onActivate;

  const onPointerEnter = () => core.setHover(true);
  const onPointerLeave = () => core.setHover(false);
  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    swallow.current = false;
    drag.current = { x: event.clientX, y: event.clientY, moved: 0 };
    event.currentTarget.setPointerCapture(event.pointerId);
    core.setPressed(true);
    core.pulse();
  };
  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const current = drag.current;
    if (!current) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    current.x = event.clientX;
    current.y = event.clientY;
    current.moved += Math.abs(dx) + Math.abs(dy);
    if (current.moved > 6) {
      event.currentTarget.classList.add('dragging');
      core.drag(dx, dy);
    }
  };
  const end = (event: PointerEvent<HTMLElement>) => {
    if (!drag.current) return;
    swallow.current = drag.current.moved > 6;
    drag.current = null;
    core.setPressed(false);
    event.currentTarget.classList.remove('dragging');
  };
  const onClick = () => {
    if (swallow.current) {
      swallow.current = false;
      return;
    }
    activate.current?.();
  };

  return { onPointerEnter, onPointerLeave, onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end, onClick };
}
