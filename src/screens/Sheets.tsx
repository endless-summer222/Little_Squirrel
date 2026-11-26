import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { converter, formatHex } from 'culori';
import { parseHex } from '../core/pixels';
import { useApp } from '../state/useApp';
import { ColorWheel } from '../components/ColorWheel';
import {
  Check,
  Ellipse,
  Lasso,
  Marquee,
  Move,
  Pencil,
  RectIcon,
  Wand,
} from '../components/icons';

export function Sheet({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose?: () => void;
}) {
  const setSheet = useApp((s) => s.setSheet);
  const close = () => {
    onClose?.();
    setSheet(null);
  };
  return (
    <>
      <div className="scrim" onClick={close} />
      <section className="sheet" role="dialog" aria-label={title}>
        <div className="grip" />
        <h3>{title}</h3>
        <div className="body">{children}</div>
      </section>
    </>
  );
}

const SIZES = [32, 64, 128, 256, 512, 1024];

export function NewProjectSheet({ folderId }: { folderId: string | null }) {
  const createProject = useApp((s) => s.createProject);
  const [width, setWidth] = useState(64);
  const [height, setHeight] = useState(64);
  const [name, setName] = useState('');

  const clamp = (v: number) => Math.min(1024, Math.max(32, Math.round(v) || 32));
  const preset = (n: number) => {
    setWidth(n);
    setHeight(n);
  };

  return (
    <Sheet title="新建贴图">
      <div className="muted" style={{ marginBottom: 8 }}>
        预设（正方形）
      </div>
      <div className="opt-grid">
        {SIZES.map((s) => (
          <button
            key={s}
            className={`opt ${width === s && height === s ? 'sel' : ''}`}
            onClick={() => preset(s)}
          >
            {s} × {s}
          </button>
        ))}
      </div>

      <div className="muted" style={{ margin: '6px 0 8px' }}>
        自定义宽高（32 ~ 1024，可非正方形）
      </div>
      <div className="size-inputs">
        <label>
          <span>宽</span>
          <input
            type="number"
            min={32}
            max={1024}
            value={width}
            onChange={(e) => setWidth(Number(e.target.value))}
            onBlur={(e) => setWidth(clamp(Number(e.target.value)))}
            aria-label="画布宽度"
          />
        </label>
        <span className="times">×</span>
        <label>
          <span>高</span>
          <input
            type="number"
            min={32}
            max={1024}
            value={height}
            onChange={(e) => setHeight(Number(e.target.value))}
            onBlur={(e) => setHeight(clamp(Number(e.target.value)))}
            aria-label="画布高度"
          />
        </label>
      </div>

      <div className="row" style={{ borderBottom: 0 }}>
        <input
          className="text-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="名称（可选）"
        />
        <button
          className="primary"
          style={{ height: 40 }}
          onClick={() => createProject(clamp(width), clamp(height), name, folderId)}
        >
          创建
        </button>
      </div>
      <p className="muted" style={{ margin: '8px 0 0' }}>
        新建画布为透明空白；1024² 更吃内存，手机建议 512² 以内。
      </p>
    </Sheet>
  );
}

export function NewFolderSheet({ folderId }: { folderId: string | null }) {
  const createFolder = useApp((s) => s.createFolder);
  const [name, setName] = useState('');
  return (
    <Sheet title="新建文件夹">
      <div className="row" style={{ borderBottom: 0 }}>
        <input
          className="text-input"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="文件夹名称"
        />
        <button className="primary" style={{ height: 40 }} onClick={() => createFolder(name, folderId)}>
          创建
        </button>
      </div>
    </Sheet>
  );
}

export function RenameSheet({
  id,
  initial,
  onClose,
}: {
  id: string;
  initial: string;
  onClose: () => void;
}) {
  const renameProject = useApp((s) => s.renameProject);
  const setSheet = useApp((s) => s.setSheet);
  const [name, setName] = useState(initial);

  const save = () => {
    renameProject(id, name);
    setSheet(null);
    onClose();
  };

  return (
    <Sheet title="重命名" onClose={onClose}>
      <div className="row" style={{ borderBottom: 0 }}>
        <input
          className="text-input"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
          }}
          aria-label="名称"
        />
        <button className="primary" style={{ height: 40 }} onClick={save}>
          保存
        </button>
      </div>
    </Sheet>
  );
}

export function SettingsSheet() {
  const rows: [string, string][] = [
    ['主题', '深色'],
    ['透明区显示', '棋盘格'],
    ['顶栏切换器', '图层'],
    ['双指轻点撤销', '开'],
    ['三指轻点重做', '开'],
    ['网格默认显示', '开'],
    ['历史内存上限', '96 MB'],
    ['语言', '简体中文'],
    ['版本', '0.2.0 (M0)'],
  ];
  return (
    <Sheet title="设置">
      {rows.map(([k, v]) => (
        <div className="row" key={k}>
          <span>{k}</span>
          <span className="muted">{v}</span>
        </div>
      ))}
    </Sheet>
  );
}

export function HelpSheet() {
  const items: [string, string][] = [
    ['单指拖动', '绘制'],
    ['双指捏合', '缩放 0.25× ~ 64×'],
    ['双指拖动', '平移画布'],
    ['双指轻点', '撤销'],
    ['三指轻点', '重做'],
    ['长按画布', '取色 + 放大镜'],
    ['双击画布', '100% / 适应屏幕'],
  ];
  return (
    <Sheet title="手势与提示">
      <ul className="help-list">
        {items.map(([a, b]) => (
          <li key={a}>
            <span>{a}</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
      <p className="muted" style={{ margin: '4px 0 0' }}>
        当前为 M0 演示版：画笔、橡皮、油漆桶、取色器可用。
      </p>
    </Sheet>
  );
}

const hsv = converter('hsv');

function RgbRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="slider-line">
      <span className="slabel">{label}</span>
      <input
        type="range"
        min={0}
        max={255}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="sval">{value}</span>
    </div>
  );
}

export function ColorSheet({
  color,
  alpha,
  palette,
  onChange,
  onAlpha,
}: {
  color: string;
  alpha: number;
  palette: string[];
  onChange: (hex: string) => void;
  onAlpha: (a: number) => void;
}) {
  const current = hsv(color) ?? { h: 0, s: 0, v: 1 };
  const rgb = parseHex(color);
  const [hexText, setHexText] = useState(color);

  const setHsv = (patch: Partial<{ h: number; s: number; v: number }>) => {
    const next = {
      mode: 'hsv' as const,
      h: patch.h ?? current.h ?? 0,
      s: patch.s ?? current.s ?? 0,
      v: patch.v ?? current.v ?? 1,
    };
    const out = formatHex(next) ?? '#000000';
    onChange(out.toUpperCase());
    setHexText(out.toUpperCase());
  };

  const setChannel = (key: 'r' | 'g' | 'b', value: number) => {
    const next = { ...rgb, [key]: value };
    const out =
      formatHex({
        mode: 'rgb',
        r: next.r / 255,
        g: next.g / 255,
        b: next.b / 255,
        a: 1,
      }) ?? '#000000';
    onChange(out.toUpperCase());
    setHexText(out.toUpperCase());
  };

  const h = Math.round(current.h ?? 0);
  const s = Math.round((current.s ?? 0) * 100);
  const v = Math.round((current.v ?? 0) * 100);

  return (
    <Sheet title="颜色">
      <ColorWheel color={color} onChange={onChange} />

      <div className="row">
        <span
          className="color-preview"
          style={{
            background: color,
            opacity: alpha / 255,
            flex: 'none',
            width: 36,
            height: 36,
          }}
        />
        <input
          className="hex"
          value={hexText}
          onChange={(e) => setHexText(e.target.value)}
          onBlur={() => {
            if (/^#?[0-9a-fA-F]{6}$/.test(hexText)) {
              const val = hexText.startsWith('#') ? hexText : `#${hexText}`;
              onChange(val.toUpperCase());
              setHexText(val.toUpperCase());
            } else {
              setHexText(color);
            }
          }}
          aria-label="HEX"
        />
        <span className="muted">A {Math.round((alpha / 255) * 100)}%</span>
      </div>

      <div className="slider-line">
        <span className="slabel">H</span>
        <input
          className="hue-track"
          type="range"
          min={0}
          max={359}
          value={h}
          onChange={(e) => setHsv({ h: Number(e.target.value) })}
        />
        <span className="sval">{h}°</span>
      </div>
      <div className="slider-line">
        <span className="slabel">S</span>
        <input
          type="range"
          min={0}
          max={100}
          value={s}
          onChange={(e) => setHsv({ s: Number(e.target.value) / 100 })}
        />
        <span className="sval">{s}%</span>
      </div>
      <div className="slider-line">
        <span className="slabel">V</span>
        <input
          type="range"
          min={0}
          max={100}
          value={v}
          onChange={(e) => setHsv({ v: Number(e.target.value) / 100 })}
        />
        <span className="sval">{v}%</span>
      </div>

      <div className="subhead">RGBA</div>
      <RgbRow label="R" value={rgb.r} onChange={(x) => setChannel('r', x)} />
      <RgbRow label="G" value={rgb.g} onChange={(x) => setChannel('g', x)} />
      <RgbRow label="B" value={rgb.b} onChange={(x) => setChannel('b', x)} />
      <div className="slider-line">
        <span className="slabel">A</span>
        <input
          type="range"
          min={0}
          max={255}
          value={alpha}
          onChange={(e) => onAlpha(Number(e.target.value))}
        />
        <span className="sval">{Math.round((alpha / 255) * 100)}%</span>
      </div>

      <div className="row" style={{ borderBottom: 0, alignItems: 'flex-start' }}>
        <span>
          色板 <span className="muted">{palette.length}/64</span>
        </span>
        {palette.length === 0 ? (
          <span className="muted">用画笔蘸一下颜色就会记录</span>
        ) : (
          <div className="palette-grid">
            {palette.map((c) => (
              <button
                key={c}
                onClick={() => {
                  onChange(c);
                  setHexText(c);
                }}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  background: c,
                  border: '1px solid rgba(255,255,255,.14)',
                }}
                aria-label={c}
              />
            ))}
          </div>
        )}
      </div>
    </Sheet>
  );
}

export type SelectionTool = 'rect' | 'ellipse' | 'lasso' | 'polygon' | 'wand' | 'move';

export function SelectionSheet({ onPick }: { onPick: (tool: SelectionTool) => void }) {
  const items: { id: SelectionTool; label: string; icon: ReactNode }[] = [
    { id: 'rect', label: '矩形', icon: <RectIcon size={20} /> },
    { id: 'ellipse', label: '椭圆', icon: <Ellipse size={20} /> },
    { id: 'lasso', label: '套索', icon: <Lasso size={20} /> },
    { id: 'polygon', label: '多边形', icon: <Marquee size={20} /> },
    { id: 'wand', label: '魔棒', icon: <Wand size={20} /> },
    { id: 'move', label: '移动', icon: <Move size={20} /> },
  ];
  return (
    <Sheet title="选区">
      <div className="sel-grid">
        {items.map((it) => (
          <button key={it.id} className="sel-tool" onClick={() => onPick(it.id)}>
            {it.icon}
            <span>{it.label}</span>
          </button>
        ))}
      </div>
      <div className="sel-actions">
        {['全选', '反选', '取消选择', '扩展 1px', '收缩 1px'].map((t) => (
          <button key={t} className="chipbtn">
            {t}
          </button>
        ))}
      </div>
      <p className="muted" style={{ margin: '12px 0 0' }}>
        选区引擎将在 M2 接入；当前可先切到「移动」查看工具栏状态。
      </p>
    </Sheet>
  );
}

export function LayersSheet({
  layers,
  activeIndex,
  onSelect,
  onReorder,
}: {
  layers: { id: string; name: string }[];
  activeIndex: number;
  onSelect: (i: number) => void;
  onReorder: (from: number, to: number) => void;
}) {
  const [blend, setBlend] = useState<Record<string, string>>({});
  const [drag, setDrag] = useState<{ from: number; to: number; id: string } | null>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const rectsRef = useRef<{ top: number; height: number }[]>([]);
  const activeId = layers[activeIndex]?.id;

  const order = (() => {
    if (!drag || drag.from === drag.to) return layers;
    const next = [...layers];
    const [item] = next.splice(drag.from, 1);
    next.splice(drag.to, 0, item);
    return next;
  })();

  const startDrag = (e: ReactPointerEvent<HTMLButtonElement>, from: number) => {
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    rectsRef.current = rowRefs.current.map((el) => {
      const r = el?.getBoundingClientRect();
      return { top: r?.top ?? 0, height: r?.height ?? 0 };
    });
    setDrag({ from, to: from, id: layers[from].id });
  };

  const moveDrag = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag) return;
    const y = e.clientY;
    let to = rectsRef.current.findIndex((r) => y < r.top + r.height / 2);
    if (to === -1) to = layers.length - 1;
    to = Math.max(0, Math.min(layers.length - 1, to));
    if (to !== drag.to) setDrag({ ...drag, to });
  };

  const endDrag = () => {
    if (drag && drag.from !== drag.to) onReorder(drag.from, drag.to);
    setDrag(null);
  };

  return (
    <Sheet title="图层">
      {order.map((layer, i) => {
        const isDragging = drag?.id === layer.id;
        return (
          <div
            key={layer.id}
            ref={(el) => {
              rowRefs.current[i] = el;
            }}
            className={`layer ${layer.id === activeId ? 'sel' : ''} ${isDragging ? 'dragging' : ''}`}
            onClick={() => onSelect(layers.findIndex((l) => l.id === layer.id))}
            role="button"
          >
            <button
              className="drag-handle"
              aria-label={`拖动 ${layer.name}`}
              onPointerDown={(e) => startDrag(e, layers.findIndex((l) => l.id === layer.id))}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <span />
              <span />
              <span />
            </button>
            <div className="lthumb" />
            <div className="lname">
              {layer.name}
              <div className="lmeta">
                {blend[layer.id] ?? '正常'} · {i === activeIndex ? '100%' : '80%'}
              </div>
            </div>
            <select
              value={blend[layer.id] ?? '正常'}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setBlend((m) => ({ ...m, [layer.id]: e.target.value }))}
              aria-label={`${layer.name} 混合模式`}
            >
              {['正常', '正片叠底', '滤色', '颜色减淡', '叠加', '柔光'].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </div>
        );
      })}
      <div className="row" style={{ borderBottom: 0 }}>
        <button className="chipbtn">＋ 新建</button>
        <button className="chipbtn">复制</button>
        <button className="chipbtn">合并</button>
        <button className="chipbtn danger">删除</button>
      </div>
      <p className="muted" style={{ margin: '4px 0 0' }}>
        拖动左侧手柄调整上下顺序；绘制目前仍写入单个缓冲，多图层合成在 M1 接入。
      </p>
    </Sheet>
  );
}

export function EffectsSheet({ onNoise }: { onNoise: (amount: number) => void }) {
  const [amount, setAmount] = useState(18);
  return (
    <Sheet title="效果">
      <div className="row">
        <span>噪点</span>
        <span className="muted">{amount}%</span>
      </div>
      <div className="slider-line">
        <span className="slabel">
          <Pencil size={14} />
        </span>
        <input
          type="range"
          min={0}
          max={100}
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
        />
      </div>
      <div className="row">
        <span>平铺预览 2×2</span>
        <span className="muted">M3</span>
      </div>
      <div className="row">
        <span className="muted">单色 / 彩色</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="chipbtn">单色</button>
          <button className="chipbtn">彩色</button>
        </div>
      </div>
      <button
        className="primary"
        style={{ width: '100%', marginTop: 12 }}
        onClick={() => onNoise(amount)}
      >
        应用噪点
      </button>
      <p className="muted" style={{ margin: '10px 0 0' }}>
        应用到当前图层，可撤销。
      </p>
    </Sheet>
  );
}

export function SelectionBadge() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#7CB342' }}>
      <Check size={14} /> 选区
    </span>
  );
}
