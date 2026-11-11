import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../../app/session';
import { attachmentFromFile, imageAttachment, MAX_ATTACHMENTS, MAX_IMAGES, type ChatAttachment } from '../../chat/attachments';
import { cloudItemStatus, cloudRef, describeChoice, localRef, parseModelRef, replyTarget } from '../../state/models';
import { frameFromStream } from '../../vision/api';
import { appendSpeech, startBrowserRecognition } from '../../voice/recognition';
import { transcribeClip, warmVoice } from '../../voice/transcribe';
import { AttachmentPreview, previewKind } from '../image-preview';
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
  onSubmit: (attachments: ChatAttachment[]) => void | boolean | Promise<void | boolean>;
  onStop?: () => void;
  busy?: boolean;
  placeholder?: string;
}) {
  const { settings, updateSettings, ollamaReady, ollamaModels, endpoints, cloudProbes, sensing, streams, toggleSensor, dictating, toggleDictation, startVoiceMeter, levelRef, toast } = useSession();
  const [open, setOpen] = useState(false);
  const [finder, setFinder] = useState(false);
  const [files, setFiles] = useState<ChatAttachment[]>([]);
  const [preview, setPreview] = useState<ChatAttachment | null>(null);
  const filesNow = useRef<ChatAttachment[]>([]);
  filesNow.current = files;
  const stopDictation = useRef(toggleDictation);
  const writeDraft = useRef(onChange);
  const beginMeter = useRef(startVoiceMeter);
  const draftNow = useRef(value);
  stopDictation.current = toggleDictation;
  writeDraft.current = onChange;
  beginMeter.current = startVoiceMeter;
  draftNow.current = value;
  const box = useRef<HTMLDivElement>(null);
  const modelBtn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const current = describeChoice(settings.chatModel, endpoints);
  const localOnly = settings.runMode === 'local-only';
  const listening = dictating;

  useEffect(() => {
    if (!dictating) return;
    let handle: { stop: () => void } | null = null;
    let base = draftNow.current;
    let segment = '';
    let reported = false;
    const note = (text: string, stop: boolean) => {
      if (reported) return;
      reported = true;
      toast(text);
      if (stop) stopDictation.current();
    };
    let browserAt = 0;
    let chain = Promise.resolve();
    const onUtterance = (event: Event) => {
      const blob = (event as CustomEvent<Blob>).detail;
      if (!(blob instanceof Blob)) return;
      chain = chain.then(async () => {
        await new Promise((resolve) => window.setTimeout(resolve, browserAt ? 200 : 0));
        if (browserAt && Date.now() - browserAt < 1600) return;
        try {
          const text = await transcribeClip(blob);
          if (!text || (browserAt && Date.now() - browserAt < 1600)) return;
          base = appendSpeech(appendSpeech(base, segment), text);
          segment = '';
          writeDraft.current(base);
        } catch (error) {
          note(error instanceof Error ? error.message : '这句话没有转成文字。', false);
        }
      });
    };
    warmVoice();
    window.addEventListener('aura-utterance', onUtterance);
    beginMeter.current();
    handle = startBrowserRecognition({
        onAudioStart: () => beginMeter.current(),
        onText: (finalText, interimText) => {
          browserAt = Date.now();
          segment = finalText;
          writeDraft.current(appendSpeech(base, `${finalText}${interimText}`));
        },
        onSegment: () => {
          base = appendSpeech(base, segment);
          segment = '';
        },
        onError: (code) => {
          if (code === 'not-allowed' || code === 'service-not-allowed') note('没有获得麦克风。允许之后再点一次语音。', true);
          else if (code !== 'aborted' && code !== 'no-speech' && code !== 'network' && code !== 'audio-capture') note('这次没有听清。可以再说一次。', false);
        },
        onEnd: () => undefined,
      });
    if (!handle) note('这台浏览器不能把语音转成文字。可以改用键盘输入。', true);
    return () => {
      window.removeEventListener('aura-utterance', onUtterance);
      handle?.stop();
    };
  }, [dictating, toast]);

  useEffect(() => {
    if (!dictating) return;
    const bars = box.current?.querySelectorAll<HTMLElement>('.bars i');
    if (!bars?.length) return;
    let frame = 0;
    const tick = () => {
      const level = levelRef.current;
      bars.forEach((bar, index) => {
        const shape = 0.45 + 0.55 * Math.abs(Math.sin(performance.now() / 140 + index * 0.9));
        bar.style.height = `${3 + level * 13 * shape}px`;
      });
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [dictating, levelRef]);

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

  const canSend = Boolean(value.trim() || files.length || streams.screen);
  const imageCount = files.filter((item) => item.kind === 'image').length;
  const seeing = replyTarget(settings, ollamaModels, endpoints, imageCount > 0);
  const frameNote = files.length
    ? imageCount
      ? seeing.ok
        ? `发送后画面会保存在这次对话里，并交给${seeing.cloud ? '云端' : '本机'}的 ${seeing.label}。`
        : seeing.message
      : '发送后文件会保存在这次对话里。'
    : streams.screen
      ? '屏幕保持共享。发送时会附上当前画面，并保存在这次对话里。'
      : '';

  const addAttachment = (next: ChatAttachment): boolean => {
    const current = filesNow.current;
    if (current.length >= MAX_ATTACHMENTS) {
      if (next.previewUrl) URL.revokeObjectURL(next.previewUrl);
      toast('一次最多 8 个附件。');
      return false;
    }
    if (next.kind === 'image' && current.filter((item) => item.kind === 'image').length >= MAX_IMAGES) {
      if (next.previewUrl) URL.revokeObjectURL(next.previewUrl);
      toast('一次最多带 4 张画面。');
      return false;
    }
    const items = [...current, next];
    filesNow.current = items;
    setFiles(items);
    return true;
  };

  const snapCamera = async () => {
    const node = video.current;
    if (!node || !streams.cam) {
      toast('先开启摄像头，再拍下这一帧。');
      return;
    }
    try {
      const blob = await frameFromStream(streams.cam);
      if (addAttachment(imageAttachment('摄像头.jpg', blob))) toast('已拍下这一帧。发送后会保存在这次对话里。');
    } catch (error) {
      toast(error instanceof Error ? error.message : '这一帧没有拍下来', { icon: 'circle-alert' });
    }
  };

  const send = () => {
    if (!canSend || busy) return;
    if (dictating) toggleDictation();
    const pending = files;
    const screen = streams.screen;
    void (async () => {
      let extra: ChatAttachment | null = null;
      if (screen) {
        try {
          const blob = await frameFromStream(screen);
          const shot = imageAttachment('屏幕.jpg', blob);
          if (pending.filter((item) => item.kind === 'image').length >= MAX_IMAGES) {
            if (shot.previewUrl) URL.revokeObjectURL(shot.previewUrl);
            toast('一次最多带 4 张画面。这一帧屏幕没有附上。');
          } else {
            extra = shot;
          }
        } catch (error) {
          toast(error instanceof Error ? error.message : '这一帧屏幕没有附上', { icon: 'circle-alert' });
          return;
        }
      }
      const outgoing = extra ? [...pending, extra] : pending;
      if (!value.trim() && outgoing.length === 0) return;
      const accepted = await Promise.resolve(onSubmit(outgoing));
      if (accepted === false) {
        if (extra?.previewUrl) URL.revokeObjectURL(extra.previewUrl);
        return;
      }
      setFiles([]);
    })();
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
        {files.map((item) => (
          <span key={item.id} className="ctx-chip">
            {item.previewUrl ? (
              <button type="button" className="chip-open" aria-label={`预览 ${item.name}`} onClick={() => setPreview(item)}>
                {item.kind === 'image' ? <img src={item.previewUrl} alt="" /> : (
                  <span className="thumb">
                    <Icon name="file" className="i i-14" />
                  </span>
                )}
                <span className="lbl">{item.name}</span>
              </button>
            ) : (
              <>
                <span className="thumb">
                  <Icon name="file" className="i i-14" />
                </span>
                <span className="lbl">{item.name}</span>
              </>
            )}
            <button
              type="button"
              className="chip-x"
              aria-label={`移除 ${item.name}`}
              onClick={() => {
                if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
                if (preview?.id === item.id) setPreview(null);
                setFiles((items) => items.filter((entry) => entry.id !== item.id));
              }}
            >
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
              if (canSend && !busy) send();
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
            accept="image/jpeg,image/png,image/webp,image/gif,.pdf,.doc,.docx,.txt,.md,.json,.csv,.tsv,.log,.js,.jsx,.ts,.tsx,.py,.css,.html,.xml,.yml,.yaml,.toml,.sh"
            onChange={(event) => {
              const picked = [...(event.target.files ?? [])];
              event.target.value = '';
              void (async () => {
                for (const file of picked) {
                  try {
                    const next = await attachmentFromFile(file);
                    if (!addAttachment(next) && next.previewUrl) URL.revokeObjectURL(next.previewUrl);
                  } catch (error) {
                    toast(error instanceof Error ? error.message : '这个文件没有附上', { icon: 'circle-alert' });
                  }
                }
              })();
            }}
          />
        </label>
        <button
          type="button"
          className="icon-btn"
          aria-label={sensing.screen ? '停止共享屏幕' : '共享屏幕'}
          aria-pressed={sensing.screen}
          data-tip={sensing.screen ? '停止共享屏幕' : '共享屏幕'}
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
            if (finder) {
              if (sensing.cam) void toggleSensor('cam');
              setFinder(false);
              return;
            }
            setFinder(true);
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
          disabled={!busy && !canSend}
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
                  {ready ? '本机已连通' : '本机未连通'}
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
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={() => {
              if (sensing.cam) void toggleSensor('cam');
              setFinder(false);
            }}
          >
            关闭
          </button>
          <button type="button" className="btn btn-sm btn-secondary" disabled={!sensing.cam} onClick={() => void snapCamera()}>
            拍下这一帧
          </button>
        </div>
      </div>
      {frameNote ? <p className="cmd-note">{frameNote}</p> : null}
      {preview?.previewUrl ? (
        <AttachmentPreview src={preview.previewUrl} name={preview.name} kind={previewKind(preview)} text={preview.text} onClose={() => setPreview(null)} />
      ) : null}
    </div>
  );
}
