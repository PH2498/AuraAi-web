import type { ReactNode } from 'react';
import { Icon } from './icon';

export function EmptyState({
  icon,
  title,
  children,
  extra,
  actions,
}: {
  icon: string;
  title: string;
  children: ReactNode;
  extra?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="glyph">
        <Icon name={icon} className="i i-20" />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
      {extra}
      {actions ? <div className="acts">{actions}</div> : null}
    </div>
  );
}
