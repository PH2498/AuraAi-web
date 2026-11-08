import { useEffect, useState } from 'react';
import { useSession } from '../app/session';
import { useCoreSlot } from '../components/aura-core/CoreProvider';
import { EmptyState } from '../components/empty-state';
import { Icon } from '../components/icon';

export function VisionPage() {
  const { streams, sensing, toggleSensor, setAura } = useSession();
  const slot = useCoreSlot<HTMLButtonElement>(true);
  const [source, setSource] = useState<'camera' | 'screen'>('camera');
  const [message, setMessage] = useState('画面只在你开启后采集。分析模型尚未接入。');
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const stream = source === 'camera' ? streams.cam : streams.screen;
  const live = Boolean(stream);
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
      setMessage(
        source === 'camera'
          ? '摄像头已开启。模型未接入，不会分析画面。'
          : '屏幕已共享。模型未接入，不会分析画面。',
      );
    });
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
            <span>模型未接入 · 画面不上传</span>
          </span>
        </div>
        <div className={`frame${live ? ' live' : ''}${source === 'camera' ? ' mirror' : ''}`}>
          <div className="view">
            <video ref={setVideo} playsInline muted />
          </div>
          <div className={`frame-state${live ? '' : ' on'}`}>
            {blocked ? (
              <EmptyState icon={camera ? 'video-off' : 'monitor-off'} title={message}>
                {camera
                  ? '浏览器没有授予摄像头。允许之后，画面只在这台浏览器里预览，模型不会分析。'
                  : '浏览器没有授予屏幕共享。允许之后，画面只在这台浏览器里预览，模型不会分析。'}
              </EmptyState>
            ) : (
              <EmptyState
                icon={camera ? 'webcam' : 'monitor'}
                title={camera ? '摄像头还没开启' : '还没有选择画面'}
                extra={
                  <ol className="steps">
                    {(camera
                      ? ['点「开启摄像头」，系统会询问权限', '确认预览里是你想看的内容', '点「分析这一帧」。模型未接入，这一帧不会被分析']
                      : ['点「选择屏幕」', '在系统面板里选一个来源', '点「分析这一帧」。模型未接入，这一帧不会被分析']
                    ).map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                }
              >
                {camera
                  ? '开启后只在这台浏览器里预览。分析模型尚未接入，不会自动上传。'
                  : '选择一个显示器或窗口。模型尚未接入，点「分析这一帧」也不会读取画面。'}
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
      <aside className="insight" aria-label="AURA 看到的" data-enter="" style={{ ['--enter' as string]: 1 }}>
        <div className="ins-head">
          <button ref={slot} className="core-slot" type="button" aria-label="AURA 视觉状态" />
          <div>
            <h1>AURA 看到的</h1>
            <p className="sub">{live || sensing.cam || sensing.screen ? '观察中 · 模型未接入' : '待命 · 画面未开启'}</p>
          </div>
        </div>
        <div className="ins-body scroll fade-edges">
          <EmptyState icon="aperture" title="还没有结论">
            模型未接入。开启画面后，这里只说明采集状态。
          </EmptyState>
        </div>
      </aside>
    </main>
  );
}
