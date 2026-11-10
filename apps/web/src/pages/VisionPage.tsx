import { useEffect, useRef, useState } from 'react';
import type { VisionAnalyzeResult } from '@aura/shared-types';
import { useSession } from '../app/session';
import { useCore, useCoreSlot } from '../components/aura-core/CoreProvider';
import { EmptyState } from '../components/empty-state';
import { Icon } from '../components/icon';
import { analyzeFrame, captureFrame, fetchSpeech } from '../vision/api';
import { playAnalyzeStart, startAnalyzeBed, stopAnalyzeBed } from '../vision/cues';
import { playWav, stopSpeech, unlockSpeech } from '../vision/playback';
import { resolveVision } from '../state/models';

export function VisionPage() {
  const { streams, sensing, toggleSensor, setAura, settings, ollamaModels, endpoints, requireAccount, confirm, toast } = useSession();
  const core = useCore();
  const cloudAllowed = useRef(false);
  const speakGen = useRef(0);
  const liveRef = useRef(false);
  const slot = useCoreSlot<HTMLButtonElement>(true);
  const [source, setSource] = useState<'camera' | 'screen'>('camera');
  const [message, setMessage] = useState('画面只在你开启后采集。点「分析这一帧」才会上传这一帧，原图不会保存。');
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [result, setResult] = useState<VisionAnalyzeResult | null>(null);
  const [phase, setPhase] = useState<'ready' | 'looking' | 'speaking' | 'done'>('ready');
  const stream = source === 'camera' ? streams.cam : streams.screen;
  const live = Boolean(stream);
  liveRef.current = live;
  const blocked = !live && (message.includes('被拒绝') || message.includes('不支持'));
  const camera = source === 'camera';

  useEffect(() => {
    if (!video) return;
    video.srcObject = stream;
    if (stream) void video.play().catch(() => undefined);
    return () => {
      video.srcObject = null;
    };
  }, [video, stream]);

  useEffect(() => {
    if (stream) return;
    setMessage((current) => (current.includes('已开启') || current.includes('已共享') ? '采集已停止。这一帧没有继续上传。' : current));
  }, [stream]);

  useEffect(() => {
    return () => {
      speakGen.current += 1;
      stopSpeech();
      stopAnalyzeBed();
      window.speechSynthesis?.cancel();
      core.setAmplitude(0);
      core.setTicks(0, 0);
    };
  }, [core]);

  const settle = (generation: number) => {
    if (generation !== speakGen.current) return;
    core.setAmplitude(0);
    core.setTicks(0, 0);
    core.pulse();
    setAura(liveRef.current ? 'vision' : 'idle');
    setPhase('done');
    setMessage(liveRef.current ? '还在看画面。原图没有保存。' : '这一帧已经说完。原图没有保存。');
  };

  const speak = (text: string) => {
    const generation = ++speakGen.current;
    const spoken = text.trim();
    if (!spoken) {
      stopAnalyzeBed();
      settle(generation);
      return;
    }
    stopSpeech();
    window.speechSynthesis?.cancel();
    setPhase('looking');
    setAura('thinking');
    core.setAmplitude(0);
    core.setTicks(2, 1);
    setMessage('在组织要说的话。');
    void fetchSpeech(spoken, settings.rate || 1)
      .then((bytes) => {
        if (generation !== speakGen.current) return;
        stopAnalyzeBed();
        setPhase('speaking');
        setAura('speaking');
        setMessage('正在说这一帧看到的。');
        return playWav(bytes, (level) => {
          if (generation === speakGen.current) core.setAmplitude(level);
        });
      })
      .then(() => settle(generation))
      .catch(() => {
        if (generation !== speakGen.current) return;
        stopAnalyzeBed();
        toast('这一帧的结论没有读出来', { icon: 'circle-alert' });
        settle(generation);
      });
  };

  const toggle = () => {
    void toggleSensor(source === 'camera' ? 'cam' : 'screen').then((result) => {
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      if (!result.active) {
        setMessage('已停止采集。画面只留在这台浏览器里。');
        return;
      }
      setMessage(source === 'camera' ? '摄像头已开启。只有点「分析这一帧」才会上传这一帧。' : '屏幕已共享。只有点「分析这一帧」才会上传这一帧。');
    });
  };

  const analyze = async () => {
    if (!video || busy) return;
    unlockSpeech();
    if (!(await requireAccount())) return;
    const target = resolveVision(settings, ollamaModels, endpoints);
    if (!target.ok) {
      setMessage(target.message);
      return;
    }
    const cloud = target.cloud;
    if (cloud && settings.uploadAsk === 'never') {
      setMessage('云端上传已关闭。这一帧没有发出去。');
      return;
    }
    if (cloud && (settings.uploadAsk === 'ask' || !cloudAllowed.current)) {
      const allowed = await confirm({
        title: '把这一帧发给云端模型？',
        desc: '原图不会留在 AURA 里。云端提供方会收到这一帧。',
        allow: '发送这一帧',
        deny: '不发送',
      });
      if (!allowed) {
        setMessage('这一帧没有发出去。');
        return;
      }
      if (settings.uploadAsk === 'always') cloudAllowed.current = true;
    }
    speakGen.current += 1;
    stopSpeech();
    window.speechSynthesis?.cancel();
    playAnalyzeStart();
    startAnalyzeBed();
    setBusy(true);
    setPhase('looking');
    setAura('thinking');
    core.pulse();
    core.setAmplitude(0);
    core.setTicks(2, 0);
    const advance = window.setTimeout(() => {
      if (speakGen.current) core.setTicks(2, 1);
    }, 700);
    setMessage('正在看这一帧。原图不会保存。');
    try {
      const frame = await captureFrame(video);
      const next = await analyzeFrame(frame, { provider: target.provider, providerId: target.providerId, model: target.model });
      setResult(next);
      const spoken = [next.summary, ...(next.details ?? [])].filter(Boolean).join('。');
      speak(spoken);
      const wait = Math.max(2, Number(settings.interval) || 2) * 1000;
      setCooldown(Date.now() + wait);
      window.setTimeout(() => setCooldown(0), wait);
    } catch (error) {
      speakGen.current += 1;
      stopSpeech();
      stopAnalyzeBed();
      window.speechSynthesis?.cancel();
      core.setAmplitude(0);
      core.setTicks(0, 0);
      setPhase('ready');
      setResult(null);
      setMessage(error instanceof Error ? error.message : '这一帧没有分析完');
      setAura('error');
    } finally {
      window.clearTimeout(advance);
      setBusy(false);
    }
  };

  return (
    <main className="page vision">
      <section className="viewer" aria-label="实时画面" data-enter="" style={{ ['--enter' as string]: 0 }}>
        <div className="toolbar">
          <div className="seg" role="radiogroup" aria-label="画面来源">
            <button type="button" role="radio" aria-checked={source === 'camera'} onClick={() => setSource('camera')}>
              <Icon name="webcam" className="i i-14" />
              摄像头
            </button>
            <button type="button" role="radio" aria-checked={source === 'screen'} onClick={() => setSource('screen')}>
              <Icon name="monitor" className="i i-14" />
              屏幕
            </button>
          </div>
          <span className="grow" />
          <span className="privacy">
            <Icon name="shield-check" className="i i-14" />
            <span>只在点分析时上传这一帧 · 不保存原图</span>
          </span>
        </div>
        <div className={`frame${live ? ' live' : ''}${busy ? ' analyzing' : ''}${source === 'camera' ? ' mirror' : ''}`}>
          <div className="view">
            <video ref={setVideo} playsInline muted />
          </div>
          <div className="brackets" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </div>
          <div className="scan" aria-hidden="true" />
          <div className={`frame-state${live ? '' : ' on'}`}>
            {blocked ? (
              <EmptyState icon={camera ? 'video-off' : 'monitor-off'} title={message}>
                {camera
                  ? '浏览器没有授予摄像头。允许之后，画面先只在这台浏览器里预览。'
                  : '浏览器没有授予屏幕共享。允许之后，画面先只在这台浏览器里预览。'}
              </EmptyState>
            ) : (
              <EmptyState
                icon={camera ? 'webcam' : 'monitor'}
                title={camera ? '摄像头还没开启' : '还没有选择画面'}
                extra={
                  <ol className="steps">
                    {(camera
                      ? ['点「开启摄像头」，系统会询问权限', '确认预览里是你想看的内容', '点「分析这一帧」。只有这一下会上传，原图不会保存']
                      : ['点「选择屏幕」', '在系统面板里选一个来源', '点「分析这一帧」。只有这一下会上传，原图不会保存']
                    ).map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                }
              >
                {camera
                ? '开启后先只在这台浏览器里预览。点「分析这一帧」才会把这一帧发出去。'
                : '选择一个显示器或窗口。点「分析这一帧」才会把这一帧发出去。'}
              </EmptyState>
            )}
          </div>
        </div>
        <div className="controls">
          <button type="button" className="btn btn-secondary" onClick={toggle}>
            <Icon name={live ? 'circle-stop' : 'circle-play'} />
            <span>{live ? '停止' : source === 'camera' ? '开启摄像头' : '选择屏幕'}</span>
          </button>
          <span className="tip">{message}</span>
          <span className="grow" />
          <button
            type="button"
            className="btn btn-primary"
            disabled={!live || busy || cooldown > Date.now()}
            onClick={() => void analyze()}
          >
            <Icon name="aperture" />
            分析这一帧
          </button>
        </div>
      </section>
      <aside className="insight" aria-label="AURA 看到的" data-enter="" style={{ ['--enter' as string]: 1 }}>
        <div className="ins-head">
          <div>
            <h1>AURA 看到的</h1>
            <p className="sub">
              {phase === 'looking' ? '思考中 · 正在看这一帧' : phase === 'speaking' ? '正在说 · 这一帧的结论' : phase === 'done' ? (live ? '观察中' : '待命') : live || sensing.cam || sensing.screen ? '观察中 · 还没有上传' : '待命 · 画面未开启'}
            </p>
          </div>
        </div>
        <div className="ins-body">
          <div className="ins-copy scroll fade-edges">
            {result ? (
              <article className="finding" key={result.id}>
                <h2>{result.summary}</h2>
                {result.details?.length ? (
                  <ul>
                    {result.details.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ) : null}
                <p className="when">这一帧的原图没有保存。</p>
              </article>
            ) : (
              <p className="pending">
                <b>还没有结论</b>
                <span>{message}</span>
              </p>
            )}
          </div>
          <div className="orb-stage">
            <button ref={slot} className="core-slot" type="button" aria-label="AURA 视觉状态" />
          </div>
        </div>
      </aside>
    </main>
  );
}
