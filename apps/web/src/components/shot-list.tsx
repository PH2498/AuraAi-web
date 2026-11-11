import { useState } from 'react';
import { AttachmentPreview, previewKind } from './image-preview';
import { Icon } from './icon';

export type Shot = { id?: string; name: string; type: 'image' | 'file'; mime?: string; previewUrl?: string };

export function savedShot(shot: Shot): Shot {
  if (!shot.id) return shot;
  return { ...shot, previewUrl: `/api/v1/chat/attachments/${shot.id}` };
}

export function ShotList({ shots }: { shots: Shot[] }) {
  const [open, setOpen] = useState<Shot | null>(null);
  if (!shots.length) return null;
  return (
    <>
      <div className="ask-ctx">
        {shots.map((shot, index) => {
          const body = (
            <>
              {shot.type === 'image' && shot.previewUrl ? <img src={shot.previewUrl} alt="" /> : (
                <span className="thumb">
                  <Icon name={shot.type === 'image' ? 'scan-eye' : 'file'} className="i i-14" />
                </span>
              )}
              <span className="lbl">{shot.name}</span>
            </>
          );
          return shot.previewUrl ? (
            <button type="button" className="shot" key={`${shot.type}-${shot.name}-${index}`} aria-label={`预览 ${shot.name}`} onClick={() => setOpen(shot)}>
              {body}
            </button>
          ) : (
            <span className="shot" key={`${shot.type}-${shot.name}-${index}`}>
              {body}
            </span>
          );
        })}
      </div>
      {open?.previewUrl ? (
        <AttachmentPreview src={open.previewUrl} name={open.name} kind={previewKind(open)} onClose={() => setOpen(null)} />
      ) : null}
    </>
  );
}
