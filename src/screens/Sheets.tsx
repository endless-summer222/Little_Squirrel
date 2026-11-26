import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { converter, formatHex } from 'culori';
import { parseHex } from '../core/pixels';
import type { BlendMode, Layer, LayerGroup } from '../core/types';
import type { SelectTool } from '../components/CanvasStage';
import { useApp } from '../state/useApp';
import { ColorWheel } from '../components/ColorWheel';
import {
  Check,
  Ellipse,
  Eye,
  EyeOff,
  Folder,
  Lasso,
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
  const [width, setWidth] = useState('64');
  const [height, setHeight] = useState('64');
  const [name, setName] = useState('');

  const clamp = (v: string) => {
    const n = parseInt(v, 10);
    if (!Number.isFinite(n)) return '';
    return String(Math.min(1024, Math.max(1, n)));
  };
  const preset = (n: number) => {
    setWidth(String(n));
    setHeight(String(n));
  };
  const numW = parseInt(width, 10) || 64;
  const numH = parseInt(height, 10) || 64;

  return (
    <Sheet title="新建贴图">
      <div className="muted" style={{ marginBottom: 8 }}>
        预设（正方形）
      </div>
      <div className="opt-grid">
        {SIZES.map((s) => (
          <button
            key={s}
            className={`opt ${numW === s && numH === s ? 'sel' : ''}`}
            onClick={() => preset(s)}
          >
            {s} × {s}
          </button>
        ))}
      </div>

      <div className="muted" style={{ margin: '6px 0 8px' }}>
        自定义宽高（1 ~ 1024，可非正方形）
      </div>
      <div className="size-inputs">
        <label>
          <span>宽</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={1024}
            placeholder="宽"
            value={width}
            onChange={(e) => setWidth(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
            onBlur={() => setWidth(clamp(width))}
            aria-label="画布宽度"
          />
        </label>
        <span className="times">×</span>
        <label>
          <span>高</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={1024}
            placeholder="高"
            value={height}
            onChange={(e) => setHeight(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
            onBlur={() => setHeight(clamp(height))}
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
          onClick={() => createProject(
            parseInt(clamp(width), 10) || 64,
            parseInt(clamp(height), 10) || 64,
            name,
            folderId,
          )}
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
    ['版本', '0.10_preview'],
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
    ['双指捏合', '缩放 0.1× ~ 64×'],
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
  onRemove,
  onClear,
}: {
  color: string;
  alpha: number;
  palette: string[];
  onChange: (hex: string) => void;
  onAlpha: (a: number) => void;
  onRemove: (hex: string) => void;
  onClear: () => void;
}) {
  const [manage, setManage] = useState(false);
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
        {palette.length > 0 && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="chipbtn" onClick={() => setManage((v) => !v)}>
              {manage ? '完成' : '管理'}
            </button>
            {manage && (
              <button className="chipbtn danger" onClick={onClear}>
                清空
              </button>
            )}
          </div>
        )}
      </div>
      {palette.length === 0 ? (
        <p className="muted" style={{ margin: '0 0 8px' }}>
          用画笔蘸一下颜色就会记录
        </p>
      ) : (
        <div className="palette-grid">
          {palette.map((c) => (
            <button
              key={c}
              onClick={() => {
                if (manage) {
                  onRemove(c);
                  return;
                }
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
              aria-label={manage ? `删除 ${c}` : c}
            />
          ))}
        </div>
      )}
    </Sheet>
  );
}

export type SelectionTool = 'rect' | 'ellipse' | 'lasso' | 'polygon' | 'wand' | 'move';

export function SelectionSheet({
  tool,
  onPick,
  onSelectAll,
  onInvert,
}: {
  tool: SelectTool;
  onPick: (t: SelectTool) => void;
  onSelectAll: () => void;
  onInvert: () => void;
}) {
  const tools: { id: SelectTool; label: string; icon: ReactNode }[] = [
    { id: 'rect', label: '矩形', icon: <RectIcon size={20} /> },
    { id: 'ellipse', label: '椭圆', icon: <Ellipse size={20} /> },
    { id: 'lasso', label: '套索', icon: <Lasso size={20} /> },
    { id: 'wand', label: '魔棒', icon: <Wand size={20} /> },
    { id: 'move', label: '移动', icon: <Move size={20} /> },
  ];
  return (
    <Sheet title="选区工具">
      <div className="sel-grid">
        {tools.map((it) => (
          <button
            key={it.id}
            className={`sel-tool ${tool === it.id ? 'sel' : ''}`}
            onClick={() => onPick(it.id)}
          >
            {it.icon}
            <span>{it.label}</span>
          </button>
        ))}
      </div>
      <div className="sel-actions">
        <button className="chipbtn" onClick={onSelectAll}>全选</button>
        <button className="chipbtn" onClick={onInvert}>反选</button>
      </div>
      <p className="muted" style={{ margin: '12px 0 0' }}>
        默认矩形；选中工具后在画布上拖拽创建选区。
      </p>
    </Sheet>
  );
}

const BLEND_LABEL: Record<string, string> = {
  normal: '正常',
  multiply: '正片叠底',
  screen: '滤色',
  overlay: '叠加',
  darken: '变暗',
  lighten: '变亮',
  'color-dodge': '颜色减淡',
  'color-burn': '颜色加深',
  'hard-light': '强光',
  'soft-light': '柔光',
  difference: '差值',
  exclusion: '排除',
  hue: '色相',
  saturation: '饱和度',
  color: '颜色',
  luminosity: '明度',
};

type Row =
  | { kind: 'group'; group: LayerGroup; count: number }
  | { kind: 'layer'; layer: Layer };

export function LayersSheet({
  layers,
  groups,
  activeId,
  onSelect,
  onReorder,
  onToggle,
  onOpacity,
  onBlend,
  onAdd,
  onDuplicate,
  onDelete,
  onMerge,
  onAddGroup,
  onToggleGroup,
  onAssignGroup,
  onRename,
  onClearLayer,
  onAlphaLock,
}: {
  layers: Layer[];
  groups: LayerGroup[];
  activeId: string;
  onSelect: (id: string) => void;
  onReorder: (from: number, to: number) => void;
  onToggle: (id: string) => void;
  onOpacity: (id: string, value: number) => void;
  onBlend: (id: string, blend: BlendMode) => void;
  onAdd: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMerge: () => void;
  onAddGroup: () => void;
  onToggleGroup: (id: string) => void;
  onAssignGroup: (layerId: string, groupId: string | null) => void;
  onRename: (id: string, name: string) => void;
  onClearLayer: () => void;
  onAlphaLock: (id: string) => void;
}) {
  const active = layers.find((l) => l.id === activeId) ?? layers[layers.length - 1];
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(active?.name ?? '');
  const [drag, setDrag] = useState<{
    layerId: string;
    over: number;
    overGroup: string | null;
  } | null>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const rectsRef = useRef<{ top: number; height: number }[]>([]);

  const rows: Row[] = [];
  const seen = new Set<string>();
  for (const layer of layers) {
    const g = layer.groupId ? groups.find((x) => x.id === layer.groupId) : null;
    if (g && !seen.has(g.id)) {
      seen.add(g.id);
      rows.push({
        kind: 'group',
        group: g,
        count: layers.filter((l) => l.groupId === g.id).length,
      });
    }
    if (g && !g.expanded) continue;
    rows.push({ kind: 'layer', layer });
  }
  for (const g of groups) {
    if (!seen.has(g.id)) {
      rows.push({ kind: 'group', group: g, count: 0 });
    }
  }

  const startDrag = (e: ReactPointerEvent<HTMLButtonElement>, layerId: string) => {
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    rectsRef.current = rowRefs.current.map((el) => {
      const r = el?.getBoundingClientRect();
      return { top: r?.top ?? 0, height: r?.height ?? 0 };
    });
    setDrag({ layerId, over: -1, overGroup: null });
  };

  const moveDrag = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag) return;
    let idx = rectsRef.current.findIndex((r) => e.clientY < r.top + r.height / 2);
    if (idx === -1) idx = rows.length - 1;
    const row = rows[idx];
    const overGroup = row?.kind === 'group' ? row.group.id : null;
    if (idx !== drag.over || overGroup !== drag.overGroup) {
      setDrag({ ...drag, over: idx, overGroup });
    }
  };

  const endDrag = () => {
    if (drag) {
      const row = rows[drag.over];
      if (drag.overGroup) {
        onAssignGroup(drag.layerId, drag.overGroup);
      } else if (row?.kind === 'layer') {
        const from = layers.findIndex((l) => l.id === drag.layerId);
        const to = layers.findIndex((l) => l.id === row.layer.id);
        if (from >= 0 && to >= 0) onReorder(from, to);
      }
    }
    setDrag(null);
  };

  return (
    <Sheet title="图层">
      {rows.map((row, i) => {
        if (row.kind === 'group') {
          const hover = drag?.over === i;
          return (
            <div
              key={row.group.id}
              ref={(el) => {
                rowRefs.current[i] = el;
              }}
              className={`layer group-row ${hover ? 'drop' : ''}`}
              onClick={() => onToggleGroup(row.group.id)}
              role="button"
            >
              <span className={`grp-chev ${row.group.expanded ? 'open' : ''}`}>›</span>
              <Folder size={18} />
              <div className="lname">
                {row.group.name}
                <div className="lmeta">{row.count} 个图层</div>
              </div>
            </div>
          );
        }
        const layer = row.layer;
        const isDragging = drag?.layerId === layer.id;
        return (
          <div
            key={layer.id}
            ref={(el) => {
              rowRefs.current[i] = el;
            }}
            className={`layer ${layer.id === active?.id ? 'sel' : ''} ${
              isDragging ? 'dragging' : ''
            } ${layer.groupId ? 'in-group' : ''}`}
            onClick={() => onSelect(layer.id)}
            role="button"
          >
            <button
              className="drag-handle"
              aria-label={`拖动 ${layer.name}`}
              onPointerDown={(e) => startDrag(e, layer.id)}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <span />
              <span />
              <span />
            </button>
            <button
              className="eye"
              aria-label={layer.visible ? `隐藏 ${layer.name}` : `显示 ${layer.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onToggle(layer.id);
              }}
            >
              {layer.visible ? <Eye size={18} /> : <EyeOff size={18} />}
            </button>
            <div className="lname">
              {layer.name}
              <div className="lmeta">
                {BLEND_LABEL[layer.blend] ?? layer.blend} · {Math.round(layer.opacity * 100)}%
              </div>
              {layer.id === active?.id && (
                <input
                  className="layer-opacity"
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(layer.opacity * 100)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => onOpacity(layer.id, Number(e.target.value) / 100)}
                  aria-label={`${layer.name} 不透明度`}
                />
              )}
            </div>
          </div>
        );
      })}

      <div className="row" style={{ paddingTop: 4 }}>
        <span>混合模式</span>
        <select
          value={active?.blend ?? 'normal'}
          onChange={(e) => active && onBlend(active.id, e.target.value as BlendMode)}
          aria-label="当前图层混合模式"
        >
          {Object.entries(BLEND_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {renaming && active && (
        <div className="row">
          <input
            className="name-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label="图层名称"
          />
          <button
            className="chipbtn on"
            onClick={() => {
              onRename(active.id, draft.trim() || active.name);
              setRenaming(false);
            }}
          >
            确定
          </button>
        </div>
      )}
      <div className="row" style={{ borderBottom: 0, flexWrap: 'wrap' }}>
        <button className="chipbtn" onClick={onAdd}>
          ＋ 新建
        </button>
        <button className="chipbtn" onClick={onDuplicate}>
          复制
        </button>
        <button className="chipbtn" onClick={onMerge}>
          向下合并
        </button>
        <button className="chipbtn" onClick={onAddGroup}>
          ＋ 文件夹
        </button>
        <button
          className="chipbtn"
          onClick={() => {
            setDraft(active?.name ?? '');
            setRenaming(true);
          }}
        >
          重命名
        </button>
        <button className="chipbtn" onClick={onClearLayer}>
          清空
        </button>
        <button
          className={`chipbtn ${active?.alphaLock ? 'on' : ''}`}
          onClick={() => active && onAlphaLock(active.id)}
        >
          透明锁
        </button>
        <button className="chipbtn danger" onClick={onDelete}>
          删除
        </button>
      </div>
      <p className="muted" style={{ margin: '4px 0 0' }}>
        拖动图层手柄排序；拖到文件夹行可移入；点文件夹折叠/展开。
      </p>
    </Sheet>
  );
}

export function EffectsSheet({
  onNoise,
  hasSelection,
  onAdjustHSL,
}: {
  onNoise: (amount: number) => void;
  hasSelection: boolean;
  onAdjustHSL: (dL: number, dS: number) => void;
}) {
  const [amount, setAmount] = useState(18);
  const [dL, setDL] = useState(0);
  const [dS, setDS] = useState(0);
  return (
    <Sheet title="效果">
      <div className="row">
        <span>选区明度 / 饱和度</span>
        <span className="muted">{hasSelection ? '已选中' : '无选区'}</span>
      </div>
      {hasSelection && (
        <>
          <div className="slider-line">
            <span className="slabel">亮</span>
            <input
              type="range"
              min={-100}
              max={100}
              value={dL}
              onChange={(e) => setDL(Number(e.target.value))}
            />
            <span className="sval">{dL}</span>
          </div>
          <div className="slider-line">
            <span className="slabel">饱和</span>
            <input
              type="range"
              min={-100}
              max={100}
              value={dS}
              onChange={(e) => setDS(Number(e.target.value))}
            />
            <span className="sval">{dS}</span>
          </div>
          <button
            className="primary"
            style={{ width: '100%', margin: '8px 0 4px' }}
            onClick={() => onAdjustHSL(dL, dS)}
          >
            应用到选区
          </button>
        </>
      )}
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


const GRID_COLORS = ['#FFFFFF', '#9DFFEB', '#000000', '#94A3B8', '#F472B6'];

export function GridSheet({
  color,
  onColor,
  on,
  onToggle,
  step,
  onStep,
}: {
  color: string;
  onColor: (c: string) => void;
  on: boolean;
  onToggle: () => void;
  step: number;
  onStep: (n: number) => void;
}) {
  return (
    <Sheet title="网格">
      <div className="row">
        <span>网络视图（常亮）</span>
        <button className="chipbtn" onClick={onToggle} style={on ? { background: '#9DFFEB', color: '#08211c' } : undefined}>
          {on ? '已开启' : '已关闭'}
        </button>
      </div>
      <div className="muted" style={{ margin: '12px 0 6px' }}>网格尺寸</div>
      <div className="opt-grid">
        {[1, 2, 4, 8, 16, 32].map((n) => (
          <button
            key={n}
            className={`opt ${step === n ? 'sel' : ''}`}
            onClick={() => onStep(n)}
          >
            {n} × {n}
          </button>
        ))}
      </div>
      <div className="muted" style={{ margin: '10px 0 6px' }}>分隔线颜色</div>
      <div className="palette-grid">
        {GRID_COLORS.map((c) => (
          <button
            key={c}
            className={`grid-swatch ${color.toUpperCase() === c ? 'sel' : ''}`}
            style={{ background: c }}
            aria-label={c}
            onClick={() => onColor(c)}
          />
        ))}
        <label className="grid-swatch custom" aria-label="自定义颜色">
          <input
            type="color"
            value={color}
            onChange={(e) => onColor(e.target.value.toUpperCase())}
          />
        </label>
      </div>
      <p className="muted" style={{ margin: '12px 0 0' }}>
        网络视图在任何缩放下都显示，颜色固定青色、比像素分隔线略粗。
      </p>
    </Sheet>
  );
}

export function ExportSheet({
  onExport,
  lastPath,
}: {
  onExport: (scale: number) => void;
  lastPath?: string;
}) {
  return (
    <Sheet title="导出 PNG">
      <div className="row" style={{ borderBottom: 0 }}>
        <button className="primary" style={{ flex: 1, marginRight: 8 }} onClick={() => onExport(1)}>
          导出 1×
        </button>
        <button className="primary" style={{ flex: 1 }} onClick={() => onExport(4)}>
          导出 4×
        </button>
      </div>
      <p className="muted" style={{ margin: '10px 0 0' }}>
        {lastPath ? `最近导出：${lastPath}` : '导出到 Documents/PixelUV/（Android），文件名与工程同名。'}
      </p>
    </Sheet>
  );
}

export function OverlaySheet({
  overlay,
  onImport,
  onToggle,
  onOpacity,
  onRemove,
}: {
  overlay?: { dataUrl: string; opacity: number; visible: boolean };
  onImport: (dataUrl: string) => void;
  onToggle: () => void;
  onOpacity: (v: number) => void;
  onRemove: () => void;
}) {
  return (
    <Sheet title="参考底图">
      {overlay ? (
        <>
          <img
            src={overlay.dataUrl}
            alt="参考底图"
            style={{
              width: '100%',
              borderRadius: 10,
              opacity: overlay.opacity,
              background: '#1d1d20',
            }}
          />
          <div className="row">
            <span>显示</span>
            <button className="chipbtn" onClick={onToggle}>
              {overlay.visible ? '已显示' : '已隐藏'}
            </button>
          </div>
          <div className="slider-line">
            <span className="slabel">透明</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(overlay.opacity * 100)}
              onChange={(e) => onOpacity(Number(e.target.value) / 100)}
            />
            <span className="sval">{Math.round(overlay.opacity * 100)}%</span>
          </div>
          <button className="chipbtn danger" onClick={onRemove} style={{ marginTop: 8 }}>
            移除底图
          </button>
        </>
      ) : (
        <p className="muted" style={{ marginTop: 0 }}>
          导入一张 UV 展开图（PNG/JPG）作为半透明底图，用于对位；不参与合成与导出。
        </p>
      )}
      <label
        className="primary"
        style={{
          display: 'grid',
          placeItems: 'center',
          height: 44,
          marginTop: 12,
          borderRadius: 22,
          cursor: 'pointer',
        }}
      >
        {overlay ? '更换图片' : '选择图片'}
        <input
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              const reader = new FileReader();
              reader.onload = () => onImport(String(reader.result));
              reader.readAsDataURL(f);
            }
            e.target.value = '';
          }}
        />
      </label>
    </Sheet>
  );
}
