import { useEffect, useState } from 'react';
import { ChevronLeft } from '../components/icons';
import { storageEstimate } from '../core/db';
import { loadSettings, resetSettings, saveSettings, type AppSettings } from '../core/settings';

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button className={`chipbtn ${on ? 'on' : ''}`} onClick={() => onChange(!on)}>
      {on ? '开' : '关'}
    </button>
  );
}

function Choice<T extends number>({
  value,
  options,
  onChange,
  suffix,
}: {
  value: T;
  options: T[];
  onChange: (v: T) => void;
  suffix?: string;
}) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {options.map((n) => (
        <button
          key={n}
          className={`chipbtn ${value === n ? 'on' : ''}`}
          onClick={() => onChange(n)}
        >
          {n}
          {suffix ?? ''}
        </button>
      ))}
    </div>
  );
}

export function SettingsScreen({ onBack }: { onBack: () => void }) {
  const [usage, setUsage] = useState('计算中…');
  const [cfg, setCfg] = useState<AppSettings>(() => loadSettings());

  useEffect(() => {
    let alive = true;
    void storageEstimate().then((r) => {
      if (alive) setUsage(r);
    });
    return () => {
      alive = false;
    };
  }, []);

  const update = (patch: Partial<AppSettings>) => {
    const next = { ...cfg, ...patch };
    setCfg(next);
    saveSettings(next);
  };

  return (
    <div className="settings-page">
      <header className="settings-top">
        <button className="icon-btn" aria-label="返回" onClick={onBack}>
          <ChevronLeft size={24} />
        </button>
        <h1>设置</h1>
        <span style={{ width: 44 }} />
      </header>

      <div className="settings-body">
        <section className="settings-group">
          <h2>通用</h2>
          <div className="settings-card">
            <div className="settings-row">
              <span>主题</span>
              <span className="muted">深色</span>
            </div>
            <div className="settings-row">
              <span>语言</span>
              <span className="muted">简体中文</span>
            </div>
            <div className="settings-row">
              <span>版本</span>
              <span className="muted">0.10_preview</span>
            </div>
          </div>
        </section>

        <section className="settings-group">
          <h2>画布</h2>
          <div className="settings-card">
            <div className="settings-row">
              <span>网格默认显示</span>
              <Toggle on={cfg.gridDefault} onChange={(v) => update({ gridDefault: v })} />
            </div>
            <div className="settings-row">
              <span>撤销步数</span>
              <Choice value={cfg.undoSteps} options={[30, 50, 100]} onChange={(v) => update({ undoSteps: v })} />
            </div>
            <div className="settings-row">
              <span>显示帧率</span>
              <Toggle on={cfg.perfFps} onChange={(v) => update({ perfFps: v })} />
            </div>
            <div className="settings-row">
              <span>撤销内存上限</span>
              <Choice value={cfg.undoMB} options={[32, 64, 128]} onChange={(v) => update({ undoMB: v })} suffix="MB" />
            </div>
          </div>
        </section>

        <section className="settings-group">
          <h2>手势</h2>
          <div className="settings-card">
            <div className="settings-row">
              <span>双指轻点撤销</span>
              <Toggle on={cfg.gestureUndo} onChange={(v) => update({ gestureUndo: v })} />
            </div>
            <div className="settings-row">
              <span>三指轻点重做</span>
              <Toggle on={cfg.gestureRedo} onChange={(v) => update({ gestureRedo: v })} />
            </div>
            <div className="settings-row">
              <span>双击 100% / 适应</span>
              <span className="muted">固定开启</span>
            </div>
            <div className="settings-row">
              <span>长按取色 + 放大镜</span>
              <span className="muted">固定开启</span>
            </div>
          </div>
        </section>

        <section className="settings-group">
          <h2>存储</h2>
          <div className="settings-card">
            <div className="settings-row">
              <span>已用空间</span>
              <span className="muted">{usage}</span>
            </div>
            <div className="settings-row">
              <span>工程存储</span>
              <span className="muted">IndexedDB（本机）</span>
            </div>
          </div>
        </section>

        <section className="settings-group">
          <button
            className="chipbtn danger"
            style={{ width: '100%', height: 44 }}
            onClick={() => {
              setCfg(resetSettings());
            }}
          >
            恢复默认设置
          </button>
        </section>

        <p className="settings-foot">
          Little Squirrel · 小松鼠
          <br />
          像素绘制工具
        </p>
      </div>
    </div>
  );
}
