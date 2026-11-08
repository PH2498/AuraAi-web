import { useEffect, useId, useState } from 'react';
import { Icon } from './icon';

export function LoginDialog({
  error,
  onClose,
  onSubmit,
}: {
  error: string;
  onClose: () => void;
  onSubmit: (email: string, password: string) => void;
}) {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    const frame = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      className={`scrim${open ? ' open' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <form
        className="dialog"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(email.trim(), password);
          setPassword('');
        }}
      >
        <p className="risk">
          <Icon name="lock" className="i i-14" />
          登录后才会保存对话
        </p>
        <h2 id={titleId}>登录</h2>
        <p className="desc">密码只用于这次登录，浏览器不会保存密钥或密码。</p>
        <label className="sr-only" htmlFor="login-email">
          邮箱
        </label>
        <input id="login-email" className="input" autoComplete="username" value={email} placeholder="邮箱" onChange={(event) => setEmail(event.target.value)} />
        <label className="sr-only" htmlFor="login-password">
          密码
        </label>
        <input
          id="login-password"
          className="input"
          type="password"
          autoComplete="current-password"
          value={password}
          placeholder="密码"
          onChange={(event) => setPassword(event.target.value)}
          style={{ marginTop: 8 }}
        />
        {error ? <p className="desc">{error}</p> : null}
        <div className="acts">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="btn btn-primary" disabled={email.trim().length < 3 || password.length < 8}>
            登录
          </button>
        </div>
      </form>
    </div>
  );
}
