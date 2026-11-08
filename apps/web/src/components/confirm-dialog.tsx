import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from './icon';

export type ConfirmOptions = {
  risk?: string;
  level?: 'warn' | 'high';
  title: string;
  desc?: string;
  rows?: [icon: string, label: string, detail: string][];
  ack?: string;
  deny?: string;
  allow?: string;
  danger?: boolean;
};

export function ConfirmDialog({ request, onDone }: { request: Required<Pick<ConfirmOptions, 'title'>> & ConfirmOptions; onDone: (ok: boolean) => void }) {
  const titleId = useId();
  const allowRef = useRef<HTMLButtonElement>(null);
  const ackRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [acked, setAcked] = useState(false);
  const finished = useRef(false);
  const risk = request.risk ?? '需要你的授权';
  const level = request.level ?? 'warn';
  const deny = request.deny ?? '取消';
  const allow = request.allow ?? '确认';

  useEffect(() => {
    const frame = requestAnimationFrame(() => setOpen(true));
    const focus = window.setTimeout(() => (request.ack ? ackRef.current : allowRef.current)?.focus(), 60);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(focus);
    };
  }, [request.ack]);

  const finish = (ok: boolean) => {
    if (finished.current) return;
    finished.current = true;
    setOpen(false);
    window.setTimeout(() => onDone(ok), 280);
  };

  return (
    <div
      className={`scrim${open ? ' open' : ''}`}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          finish(false);
          return;
        }
        if (event.key !== 'Tab') return;
        const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input')];
        const index = focusable.indexOf(document.activeElement as HTMLElement);
        if (event.shiftKey && index <= 0) {
          event.preventDefault();
          focusable.at(-1)?.focus();
        } else if (!event.shiftKey && index === focusable.length - 1) {
          event.preventDefault();
          focusable[0]?.focus();
        }
      }}
    >
      <div className="dialog">
        <p className={`risk${level === 'high' ? ' high' : ''}`}>
          <Icon name={level === 'high' ? 'shield-alert' : 'triangle-alert'} className="i i-14" />
          {risk}
        </p>
        <h2 id={titleId}>{request.title}</h2>
        {request.desc ? <p className="desc">{request.desc}</p> : null}
        {request.rows?.length ? (
          <div className="rows">
            {request.rows.map(([icon, label, detail]) => (
              <div key={label}>
                <Icon name={icon} />
                <span>
                  <b>{label}</b>
                  {detail}
                </span>
              </div>
            ))}
          </div>
        ) : null}
        {request.ack ? (
          <label className="ack">
            <input ref={ackRef} type="checkbox" checked={acked} onChange={(event) => setAcked(event.target.checked)} />
            <span>{request.ack}</span>
          </label>
        ) : null}
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={() => finish(false)}>
            {deny}
          </button>
          <button
            ref={allowRef}
            type="button"
            className={`btn ${request.danger ? 'btn-danger' : 'btn-primary'}`}
            disabled={Boolean(request.ack) && !acked}
            onClick={() => finish(true)}
          >
            {allow}
          </button>
        </div>
      </div>
    </div>
  );
}
