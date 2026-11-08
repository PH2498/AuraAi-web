import { useEffect, useRef, useState } from 'react';
import { useSession } from '../../app/session';
import { MODELS, type ModelId } from '../../state/settings';
import { Icon } from '../icon';

export function CommandBar({
  value,
  onChange,
  onSubmit,
  busy,
  placeholder = '让 AURA 帮你做点什么…',
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (files: string[]) => void;
  busy?: boolean;
  placeholder?: string;
}) {
  const { settings, updateSettings, ollamaReady, sensing, streams, toggleSensor } = useSession();
  const [open, setOpen] = useState(false);
  const [finder, setFinder] = useState(false);
  const [files, setFiles] = useState<string[]>([]);
  const box = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const current = MODELS[settings.model];
  const listening = sensing.mic;

  useEffect(() => {
    if (!open && !finder) return;
    const close = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) {
        setOpen(false);
        setFinder(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      setFinder(false);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open, finder]);

  useEffect(() => {
    const node = video.current;
    if (!node) return;
    node.srcObject = finder ? streams.cam : null;
    if (finder && streams.cam) void node.play().catch(() => undefined);
  }, [finder, streams.cam]);

  return (
    <div
      className="cmd"
      data-mode={listening ? 'listening' : busy ? 'busy' : 'idle'}
      ref={box}
    >
      <div className="cmd-ctx" aria-label="已附加的上下文">
        {files.map((name) => (
          <span key={name} className="ctx-chip">
            <span className="thumb">
              <Icon name="file" className="i i-14" />
            </span>
            <span className="lbl">{name}</span>
            <button type="button" aria-label={`移除 ${name}`} onClick={() => setFiles((items) => items.filter((item) => item !== name))}>
              <Icon name="x" className="i i-14" />
            </button>
          </span>
        ))}
      </div>
      <div className="cmd-field">
        <label className="sr-only" htmlFor="command-input">
          给 AURA 的指令
        </label>
        <textarea
          id="command-input"
          className="cmd-input"
          rows={1}
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              if (value.trim() && !busy) onSubmit(files);
            }
          }}
        />
        <div className="cmd-transcript" aria-live="polite">
          {listening ? '正在听… 音量来自麦克风，不会生成文字。' : ''}
        </div>
      </div>
      <div className="cmd-tools">
        <label className="icon-btn" aria-label="添加文件或图片" data-tip="文件或图片">
          <Icon name="paperclip" className="i i-18" />
          <input
            type="file"
            hidden
            multiple
            onChange={(event) => {
              const names = [...(event.target.files ?? [])].map((file) => file.name);
              setFiles((items) => [...new Set([...items, ...names])]);
              event.target.value = '';
            }}
          />
        </label>
        <button
          type="button"
          className="icon-btn"
          aria-label="截取屏幕或窗口"
          aria-pressed={sensing.screen}
          data-tip="截取屏幕或窗口"
          onClick={() => void toggleSensor('screen')}
        >
          <Icon name="monitor" className="i i-18" />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="摄像头画面"
          aria-expanded={finder}
          aria-pressed={sensing.cam}
          data-tip="摄像头画面"
          onClick={() => {
            setFinder((openNow) => !openNow);
            if (!sensing.cam) void toggleSensor('cam');
          }}
        >
          <Icon name="camera" className="i i-18" />
        </button>
        <span className="sep" aria-hidden="true" />
        <button type="button" className="model-btn" aria-haspopup="menu" aria-expanded={open} aria-controls="modelMenu" onClick={() => setOpen((v) => !v)}>
          <Icon name={current.icon} />
          <span>{current.name}</span>
          <span className="where">{current.where}</span>
          <Icon name="chevron-down" className="i i-14" />
        </button>
        <span className="grow" />
        <button
          type="button"
          className="voice-btn"
          aria-pressed={listening}
          data-tip="语音会话 ⌥ Space"
          onClick={() => void toggleSensor('mic')}
        >
          <Icon name="audio-lines" className="i mic-ico" />
          <span className="bars" aria-hidden="true">
            <i /><i /><i /><i /><i />
          </span>
          <span>{listening ? '聆听中' : '语音'}</span>
        </button>
        <button
          type="button"
          className="send-btn"
          aria-label="发送"
          disabled={!value.trim() || busy}
          onClick={() => onSubmit(files)}
        >
          <Icon name="arrow-up" className="i i-18" />
        </button>
      </div>
      <div className={`menu${open ? ' open' : ''}`} id="modelMenu" role="menu" aria-label="选择模型" style={{ bottom: 'calc(100% + 10px)', left: 0, width: 320 }}>
        {(Object.keys(MODELS) as ModelId[]).map((id) => {
          const item = MODELS[id];
          const blocked = item.cloud && settings.runMode === 'local-only';
          const ready = id === 'local' && ollamaReady;
          const label = blocked ? '仅本地模式' : ready ? '已连接' : item.cloud ? '未配置 Key' : '未配置';
          return (
            <button
              key={id}
              type="button"
              className="menu-item"
              role="menuitemradio"
              aria-checked={settings.model === id}
              disabled={blocked}
              onClick={() => {
                updateSettings({ model: id });
                setOpen(false);
              }}
            >
              <Icon name={item.icon} />
              <span>
                <b>{item.name}</b>
                <span className="sub">
                  {item.provider} · {item.where}
                </span>
              </span>
              <span className={`pill${ready ? ' ok' : ' warn'}`}>
                <span className="dot" />
                {label}
              </span>
            </button>
          );
        })}
      </div>
      <div className={`menu viewfinder${finder ? ' open' : ''}`} role="dialog" aria-label="摄像头画面">
        <div className="vf-wrap">
          <video ref={video} playsInline muted />
          <span className="pill sense-cam live">
            <span className="dot" />
            {sensing.cam ? '摄像头开启中' : '尚未开启'}
          </span>
        </div>
        <div className="vf-bar">
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => void toggleSensor('cam')}>
            {sensing.cam ? '关闭' : '开启'}
          </button>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={() => setFinder(false)}
          >
            收起
          </button>
        </div>
      </div>
    </div>
  );
}
