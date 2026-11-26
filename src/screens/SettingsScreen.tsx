import { useEffect, useState } from 'react';
import { ChevronLeft } from '../components/icons';
import { storageEstimate } from '../core/db';

export function SettingsScreen({ onBack }: { onBack: () => void }) {
  const [usage, setUsage] = useState('计算中…');

  useEffect(() => {
    let alive = true;
    void storageEstimate().then((r) => {
      if (alive) setUsage(r);
    });
    return () => {
      alive = false;
    };
  }, []);

  const groups: { title: string; rows: [string, string][] }[] = [
    {
      title: '通用',
      rows: [
        ['主题', '深色'],
        ['语言', '简体中文'],
        ['版本', '0.10_preview'],
      ],
    },
    {
      title: '画布',
      rows: [
        ['透明区显示', '棋盘格'],
        ['网格默认', '跟随上次设置'],
        ['撤销步数', '100 步 / 64 MB 预算'],
        ['缩放范围', '0.1× ~ 64×'],
      ],
    },
    {
      title: '手势',
      rows: [
        ['双指轻点', '撤销'],
        ['三指轻点', '重做'],
        ['双击画布', '100% / 适应屏幕'],
        ['长按画布', '取色 + 放大镜'],
      ],
    },
    {
      title: '存储',
      rows: [
        ['已用空间', usage],
        ['工程存储', 'IndexedDB（本机）'],
      ],
    },
  ];

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
        {groups.map((g) => (
          <section key={g.title} className="settings-group">
            <h2>{g.title}</h2>
            <div className="settings-card">
              {g.rows.map(([k, v]) => (
                <div className="settings-row" key={k}>
                  <span>{k}</span>
                  <span className="muted">{v}</span>
                </div>
              ))}
            </div>
          </section>
        ))}

        <p className="settings-foot">
          Little Squirrel · 小松鼠
          <br />
          像素 UV 贴图绘制工具
        </p>
      </div>
    </div>
  );
}
