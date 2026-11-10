import { Component, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { failed: boolean };

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="boot-fail">
        <h1>这一页没有打开</h1>
        <p>刷新后再试一次。还没发送的草稿会留在这台浏览器里。</p>
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          刷新
        </button>
      </main>
    );
  }
}
