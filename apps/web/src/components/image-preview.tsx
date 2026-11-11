import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icon';

export function previewKind(item: { type?: string; kind?: string; name: string; mime?: string }): 'image' | 'pdf' | 'file' {
  const type = item.type ?? item.kind;
  if (type === 'image') return 'image';
  const mime = (item.mime ?? '').toLowerCase();
  const name = item.name.toLowerCase();
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  return 'file';
}

export function AttachmentPreview({
  src,
  name,
  kind,
  text,
  onClose,
}: {
  src: string;
  name: string;
  kind: 'image' | 'pdf' | 'file';
  text?: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return createPortal(
    <div className="scrim lightbox open" role="dialog" aria-modal="true" aria-label={name} onClick={onClose}>
      <button type="button" className="icon-btn lb-close" aria-label="关闭预览" onClick={onClose}>
        <Icon name="x" />
      </button>
      <figure onClick={(event) => event.stopPropagation()}>
        {kind === 'image' ? <img src={src} alt={name} /> : null}
        {kind === 'pdf' ? <iframe title={name} src={src} /> : null}
        {kind === 'file' && text ? <pre className="file-text">{text}</pre> : null}
        {kind === 'file' && !text ? (
          <div className="file-card">
            <Icon name="file" className="i i-18" />
            <p>{name}</p>
            <a className="btn btn-sm" href={src} download={name}>打开文件</a>
          </div>
        ) : null}
        <figcaption>{name}</figcaption>
      </figure>
    </div>,
    document.body,
  );
}
