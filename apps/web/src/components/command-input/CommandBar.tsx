import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../../app/session';
import { cloudItemStatus, cloudRef, describeChoice, localRef, parseModelRef } from '../../state/models';
import { startBrowserRecognition } from '../../voice/recognition';
import { Icon } from '../icon';

export function CommandBar({
  value,
  onChange,
  onSubmit,
  onStop,
  busy,
  placeholder = '让 AURA 帮你做点什么…',
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (files: string[]) => void;
  onStop?: () => void;
  busy?: boolean;
  placeholder?: string;
}) {
  const { settings, updateSettings, ollamaReady, ollamaModels, endpoints, cloudProbes, sensing, streams, toggleSensor, dictating, toggleDictation, startVoiceMeter, releaseVoiceMeter, markDictationHeard, toast } = useSession();
  const [open, setOpen] = useState(false);
  const [finder, setFinder] = useState(false);
  const [files, setFiles] = useState<string[]>([]);
  const stopDictation = useRef(toggleDictation);
  const writeDraft = useRef(onChange);
  const beginMeter = useRef(startVoiceMeter);
  const dropMeter = useRef(releaseVoiceMeter);
  const heard = useRef(markDictationHeard);
  stopDictation.current = toggleDictation;
  writeDraft.current = onChange;
  beginMeter.current = startVoiceMeter;
  dropMeter.current = releaseVoiceMeter;
  heard.current = markDictationHeard;
  const box = useRef<HTMLDivElement>(null);
  const modelBtn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const current = describeChoice(settings.chatModel, endpoints);
  const localOnly = settings.runMode === 'local-only';
  const listening = dictating;

  useEffect(() => {
    if (!dictating) return;
    let handle: { stop: () => void; restart: () => void } | null = null;
    let reported = false;
    const fail = (text: string) => {
      if (reported) return;
      reported = true;
      toast(text);
      stopDictation.current();
    };
    const yieldMeter = () => {
      dropMeter.current();
      handle?.restart();
    };
    const timer = window.setTimeout(() => {
      handle = startBrowserRecognition({
        onAudioStart: () => beginMeter.current(),
        onText: (text) => {
          writeDraft.current(text);
          heard.current();
        },
        onError: (code) => {
          if (code === 'not-allowed' || code === 'service-not-allowed') fail('没有获得麦克风。允许之后再点一次语音。');
          else if (code === 'network') fail('浏览器的语音识别没有连上，这句话没有转成文字。');
          else if (code === 'audio-capture') {
            if (dropMeter.current()) return true;
            fail('麦克风正被占用，这次没有听清。');
          } else if (code !== 'aborted' && code !== 'no-speech') fail('这次没有听清。可以再说一次。');
        },
        onEnd: () => undefined,
      });
      if (!handle) fail('这台浏览器不能把语音转成文字。可以改用键盘输入。');
    }, 120);
    window.addEventListener('aura-meter-yield', yieldMeter);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('aura-meter-yield', yieldMeter);
      handle?.stop();
    };
  }, [dictating, toast]);

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
    if (!open) return;
    const host = box.current;
    const trigger = modelBtn.current;
    const panel = menu.current;
    if (!host || !trigger || !panel) return;
    const width = Math.min(372, host.clientWidth - 16);
    const maxLeft = Math.max(8, host.clientWidth - width - 8);
    panel.style.width = `${width}px`;
    panel.style.left = `${Math.max(8, Math.min(trigger.offsetLeft, maxLeft))}px`;
  }, [open, ollamaModels.length, endpoints.length]);

  useEffect(() => {
    const node = video.current;
    if (!node) return;
    node.srcObject = finder ? streams.cam : null;
    if (finder && streams.cam) void node.play().catch(() => undefined);
  }, [finder, streams.cam]);

  const send = () => {
    if (dictating) toggleDictation();
    onSubmit(files);
  };

  const choose = (value: string) => {
    updateSettings({ chatModel: value });
    setOpen(false);
  };

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
          placeholder={listening ? '正在听…' : placeholder}
          autoComplete="off"
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              if (value.trim() && !busy) send();
            }
          }}
        />
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
        <button ref={modelBtn} type="button" className="model-btn" aria-haspopup="menu" aria-expanded={open} aria-controls="modelMenu" onClick={() => setOpen((v) => !v)}>
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
          onClick={() => toggleDictation()}
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
          aria-label={busy ? '停止生成' : '发送'}
          disabled={!busy && !value.trim()}
          onClick={() => (busy ? onStop?.() : send())}
        >
          <Icon name={busy ? 'square' : 'arrow-up'} className="i i-18" />
        </button>
      </div>
      <div ref={menu} className={`menu cmd-models${open ? ' open' : ''}`} id="modelMenu" role="menu" aria-label="选择模型" style={{ ['--origin' as string]: 'bottom left' }}>
        <div className="menu-label">本地</div>
        {ollamaModels.length === 0 ? <p className="menu-empty">本机还没有列出模型</p> : null}
        {ollamaModels.map((name) => {
          const selected = settings.chatModel === localRef(name);
          const ready = ollamaReady;
          return (
            <button key={name} type="button" className="menu-item" role="menuitemradio" aria-checked={selected} onClick={() => choose(localRef(name))}>
              <Icon name="hard-drive" />
              <span>
                {name}
                <span className="sub">本机 Ollama</span>
              </span>
              <span className="tail">
                <span className={`pill${ready ? ' ok' : ' warn'}`}>
                  <span className="dot" />
                  {ready ? '已连接' : '未连通'}
                </span>
                <Icon name="check" className="i check" />
              </span>
            </button>
          );
        })}
        <div className="menu-label">云端</div>
        {endpoints.length === 0 ? <p className="menu-empty">还没有接入云端接口</p> : null}
        {endpoints.map((item) => {
          const parsed = parseModelRef(settings.chatModel);
          const selected = parsed?.kind === 'cloud' && parsed.id === item.id;
          const blocked = localOnly || !item.keyConfigured || !item.defaultModel;
          const status = cloudItemStatus(item, localOnly, cloudProbes[item.id]);
          return (
            <button key={item.id} type="button" className="menu-item" role="menuitemradio" aria-checked={selected} disabled={blocked} onClick={() => choose(cloudRef(item.id))}>
              <Icon name="cloud" />
              <span>
                {item.defaultModel || item.displayName}
                <span className="sub">{item.displayName}</span>
              </span>
              <span className="tail">
                <span className={`pill${status.tone === 'ok' ? ' ok' : status.tone === 'warn' ? ' warn' : ''}`}>
                  {status.tone === 'muted' ? null : <span className="dot" />}
                  {status.text}
                </span>
                <Icon name="check" className="i check" />
              </span>
            </button>
          );
        })}
        <hr />
        <Link className="menu-item" role="menuitem" to="/settings/models" onClick={() => setOpen(false)}>
          <Icon name="settings" />
          <span>管理模型与 Provider…</span>
        </Link>
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
