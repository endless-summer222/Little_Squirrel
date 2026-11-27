import { useEffect } from 'react';
import { useApp } from './state/useApp';
import { LibraryScreen } from './screens/LibraryScreen';
import { EditorScreen } from './screens/EditorScreen';

import { Component, type ReactNode } from 'react';

class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  private reset = () => {
    try {
      indexedDB.deleteDatabase('pixeluv');
      localStorage.clear();
    } catch {
      // ignore
    }
    location.reload();
  };

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="splash" style={{ gap: 16, padding: 24 }}>
        <div className="splash-logo">Little Squirrel</div>
        <div className="splash-sub">启动失败，可能是本地数据损坏</div>
        <button className="primary" style={{ width: '100%', maxWidth: 240 }} onClick={() => location.reload()}>
          重试
        </button>
        <button className="chipbtn danger" style={{ width: '100%', maxWidth: 240 }} onClick={this.reset}>
          清空本地数据并重启
        </button>
        <p className="muted" style={{ maxWidth: 260, textAlign: 'center' }}>
          清空会删除本机工程，请谨慎操作。
        </p>
      </div>
    );
  }
}

export function App() {
  const ready = useApp((s) => s.ready);
  const screen = useApp((s) => s.screen);
  const activeId = useApp((s) => s.activeId);
  const toast = useApp((s) => s.toast);
  const hydrate = useApp((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return (
    <div className="app-shell">
      {!ready ? (
        <div className="splash">
          <div className="splash-logo">Little Squirrel</div>
          <div className="splash-sub">像素绘制工具</div>
        </div>
      ) : screen === 'library' ? (
        <LibraryScreen />
      ) : (
        <EditorScreen key={activeId ?? 'editor'} />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

export function Root() {
  return (
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  );
}
