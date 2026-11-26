import { useEffect } from 'react';
import { useApp } from './state/useApp';
import { LibraryScreen } from './screens/LibraryScreen';
import { EditorScreen } from './screens/EditorScreen';

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
          <div className="splash-logo">PixelUV</div>
          <div className="splash-sub">像素 UV 贴图编辑器</div>
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
