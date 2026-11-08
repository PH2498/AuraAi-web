import { useEffect, useState } from 'react';
import { useSession } from '../app/session';
import { useCoreSlot } from '../components/aura-core/CoreProvider';
import { Icon } from '../components/icon';

export function VisionPage() {
  const { streams, sensing, toggleSensor, setAura } = useSession();
  const slot = useCoreSlot<HTMLButtonElement>(true);
  const [source, setSource] = useState<'camera' | 'screen'>('camera');
  const [message, setMessage] = useState('画面只在你开启后采集。分析模型尚未接入。');
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const stream = source === 'camera' ? streams.cam : streams.screen;
  const live = Boolean(stream);

  useEffect(() => {
    if (!video) return;
    video.srcObject = stream;
    if (stream) void video.play().catch(() => undefined);
    return () => {
      video.srcObject = null;
    };
  }, [video, stream]);

  const toggle = () => {
    void toggleSensor(source === 'camera' ? 'cam' : 'screen').then(() => {
      setMessage(source === 'camera' ? '摄像头状态已更新。模型未接入。' : '屏幕共享状态已更新。模型未接入。');
    });
  };

  return (
    <main className="page vision">
      <section className="viewer" aria-label="实时画面">
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
            <span>模型未接入 · 画面不上传</span>
          </span>
        </div>
        <div className={`frame${live ? ' live' : ''}${source === 'camera' ? ' mirror' : ''}`}>
          <div className="view">
            <video ref={setVideo} playsInline muted />
          </div>
          <div className={`frame-state${live ? '' : ' on'}`}>
            <p className="empty-state">画面未开启。模型未接入，打开后也只在这台浏览器里显示。</p>
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
            disabled={!live}
            onClick={() => {
              setAura('thinking');
              setMessage('模型未接入。这一帧只留在浏览器里，没有被分析。');
              window.setTimeout(() => setAura(live ? 'vision' : 'idle'), 700);
            }}
          >
            <Icon name="aperture" />
            分析这一帧
          </button>
        </div>
      </section>
      <aside className="insight" aria-label="AURA 看到的">
        <div className="ins-head">
          <button ref={slot} className="core-slot" type="button" aria-label="AURA 视觉状态" />
          <div>
            <h1>AURA 看到的</h1>
            <p className="sub">{live || sensing.cam || sensing.screen ? '观察中 · 模型未接入' : '待命 · 画面未开启'}</p>
          </div>
        </div>
        <div className="ins-body scroll fade-edges">
          <p className="empty-state">还没有模型结论。开启画面后，这里只会说明采集状态。</p>
        </div>
      </aside>
    </main>
  );
}
