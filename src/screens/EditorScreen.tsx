import { useRef, useState, type ReactElement } from 'react';
import { useApp } from '../state/useApp';
import { CanvasStage, type ToolId } from '../components/CanvasStage';
import {
  Bulb,
  Bucket,
  Check,
  ChevronLeft,
  ChevronRight,
  Close,
  Dropper,
  Eraser,
  Help,
  LayersIcon,
  Marquee,
  Overlay,
  Pencil,
  Redo,
  Sparkles,
  Undo,
} from '../components/icons';
import { cloneBuffer, createDemoTexture } from '../core/pixels';
import {
  ColorSheet,
  EffectsSheet,
  HelpSheet,
  LayersSheet,
  SelectionSheet,
} from './Sheets';

const DEFAULT_SWATCHES = ['#1F2937', '#111827', '#0B1220', '#0F172A', '#4B5563', '#94A3B8'];
const MAX_PALETTE = 64;

interface ToolDef {
  id: ToolId;
  label: string;
  icon: ReactElement;
}

const TOOLS: ToolDef[] = [
  { id: 'pencil', label: '画笔', icon: <Pencil /> },
  { id: 'eraser', label: '橡皮', icon: <Eraser /> },
  { id: 'bucket', label: '油漆桶', icon: <Bucket /> },
  { id: 'dropper', label: '取色', icon: <Dropper /> },
  { id: 'shade', label: '明度', icon: <Bulb /> },
];

export function EditorScreen() {
  const project = useApp((s) => s.projects.find((p) => p.id === s.activeId));
  const sheet = useApp((s) => s.sheet);
  const setSheet = useApp((s) => s.setSheet);
  const closeProject = useApp((s) => s.closeProject);
  const updateProjectPixels = useApp((s) => s.updateProjectPixels);
  const updateProjectPalette = useApp((s) => s.updateProjectPalette);
  const showToast = useApp((s) => s.showToast);

  const width = project?.width ?? 64;
  const height = project?.height ?? 64;
  const [pixels, setPixels] = useState<Uint8ClampedArray>(() =>
    project?.pixels
      ? new Uint8ClampedArray(project.pixels)
      : createDemoTexture(Math.max(width, height), project?.id ?? 'demo'),
  );
  const pixelsRef = useRef(pixels);
  pixelsRef.current = pixels;

  const [color, setColor] = useState('#1F2937');
  const [alpha, setAlpha] = useState(255);
  const [palette, setPalette] = useState<string[]>(() => project?.palette ?? []);
  const paletteRef = useRef(palette);
  paletteRef.current = palette;

  const [tool, setTool] = useState<ToolId>('pencil');
  const [brush, setBrush] = useState(1);
  const [zoom, setZoom] = useState(() => {
    const availW = Math.min(window.innerWidth, 430) - 32;
    const availH = window.innerHeight * 0.56;
    const fit = Math.min(availW / width, availH / height);
    return Math.max(0.1, Math.min(24, Math.round(fit * 100) / 100));
  });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [layers, setLayers] = useState([
    { id: 'l1', name: '线稿' },
    { id: 'l2', name: '底色' },
    { id: 'l3', name: '阴影' },
  ]);
  const [layerIndex, setLayerIndex] = useState(1);
  const [redraw, setRedraw] = useState(0);
  const [pixelPerfect, setPixelPerfect] = useState(true);
  const [threshold, setThreshold] = useState(0);
  const [deltaL, setDeltaL] = useState(0);
  const [deltaS, setDeltaS] = useState(0);

  const undoRef = useRef<Uint8ClampedArray[]>([]);
  const redoRef = useRef<Uint8ClampedArray[]>([]);
  const [hist, setHist] = useState({ u: 0, r: 0 });

  const syncHist = () => setHist({ u: undoRef.current.length, r: redoRef.current.length });

  const rememberColor = (hex: string) => {
    if (paletteRef.current.includes(hex)) return;
    const next = [hex, ...paletteRef.current].slice(0, MAX_PALETTE);
    setPalette(next);
    if (project) updateProjectPalette(project.id, next);
  };

  const beginStroke = () => {
    undoRef.current.push(cloneBuffer(pixelsRef.current));
    if (undoRef.current.length > 40) undoRef.current.shift();
    redoRef.current = [];
    syncHist();
    if (tool === 'pencil' || tool === 'bucket') rememberColor(color);
  };

  const undo = () => {
    const prev = undoRef.current.pop();
    if (!prev) return;
    redoRef.current.push(cloneBuffer(pixelsRef.current));
    setPixels(prev);
    setRedraw((v) => v + 1);
    syncHist();
  };

  const redo = () => {
    const next = redoRef.current.pop();
    if (!next) return;
    undoRef.current.push(cloneBuffer(pixelsRef.current));
    setPixels(next);
    setRedraw((v) => v + 1);
    syncHist();
  };

  const applyNoise = (amount: number) => {
    beginStroke();
    const buf = pixelsRef.current;
    const strength = (amount / 100) * 90;
    for (let i = 0; i < buf.length; i += 4) {
      if (buf[i + 3] === 0) continue;
      const d = (Math.random() * 2 - 1) * strength;
      buf[i] = Math.max(0, Math.min(255, buf[i] + d));
      buf[i + 1] = Math.max(0, Math.min(255, buf[i + 1] + d));
      buf[i + 2] = Math.max(0, Math.min(255, buf[i + 2] + d));
    }
    setRedraw((v) => v + 1);
    setSheet(null);
    showToast('已应用噪点');
  };

  const saveAndClose = () => {
    if (project) updateProjectPixels(project.id, cloneBuffer(pixelsRef.current));
    closeProject();
    showToast('已保存');
  };

  const reorderLayers = (from: number, to: number) => {
    if (from === to) return;
    const activeId = layers[layerIndex]?.id;
    const next = [...layers];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setLayers(next);
    const idx = next.findIndex((l) => l.id === activeId);
    setLayerIndex(idx >= 0 ? idx : to);
  };

  const brushSizeControl = (
    <>
      <span>尺寸</span>
      <input
        type="range"
        min={1}
        max={50}
        value={brush}
        onChange={(e) => setBrush(Number(e.target.value))}
      />
      <input
        type="number"
        className="num-input"
        min={1}
        max={50}
        value={brush}
        onChange={(e) => {
          const v = Number(e.target.value);
          setBrush(Math.min(50, Math.max(1, Number.isFinite(v) ? Math.round(v) : 1)));
        }}
        aria-label="笔刷尺寸"
      />
      <span className="muted">px</span>
    </>
  );

  return (
    <div className="ed">
      <header className="ed-top">
        <button className="icon-btn" aria-label="关闭并保存" onClick={saveAndClose}>
          <Close size={22} />
        </button>

        <div className="seg">
          <button
            className="chev"
            aria-label="上一个图层"
            onClick={() => setLayerIndex((i) => (i + layers.length - 1) % layers.length)}
          >
            <ChevronLeft size={18} />
          </button>
          <button className="chip" onClick={() => setSheet('layers')}>
            <LayersIcon size={16} />
            <span>{layers[layerIndex]?.name ?? '图层'}</span>
          </button>
          <button
            className="chev"
            aria-label="下一个图层"
            onClick={() => setLayerIndex((i) => (i + 1) % layers.length)}
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="spacer" />

        <button
          className="icon-btn"
          aria-label="参考底图"
          onClick={() => showToast('参考底图：导入 UV 布局图（M1）')}
        >
          <Overlay size={22} />
        </button>
        <button className="icon-btn" aria-label="效果" onClick={() => setSheet('effects')}>
          <Sparkles size={22} />
        </button>
        <button
          className="icon-btn accent"
          aria-label="保存"
          onClick={saveAndClose}
        >
          <Check size={23} />
        </button>
      </header>

      <div className="ed-body">
        <div className="stage-wrap">
          <CanvasStage
            width={width}
            height={height}
            pixels={pixels}
            tool={tool}
            color={color}
            alpha={alpha}
            brush={brush}
            zoom={zoom}
            pan={pan}
            version={redraw}
            shadeL={deltaL}
            shadeS={deltaS}
            onZoom={setZoom}
            onPan={setPan}
            onBeginStroke={beginStroke}
            onDirty={() => setRedraw((v) => v + 1)}
            onPick={(hex) => {
              setColor(hex);
              setAlpha(255);
              rememberColor(hex);
              showToast(`已取色 ${hex}`);
            }}
          />
          <button
            className="canvas-help icon-btn"
            aria-label="帮助"
            onClick={() => setSheet('help')}
          >
            <Help size={20} />
          </button>
        </div>
      </div>

      <div className="param-row">
        {(tool === 'pencil' || tool === 'eraser') && (
          <>
            {brushSizeControl}
            {tool === 'pencil' ? (
              <button
                className={`toggle ${pixelPerfect ? 'on' : ''}`}
                onClick={() => setPixelPerfect((v) => !v)}
              >
                <span className="dot">{pixelPerfect ? <Check size={11} /> : null}</span>
                像素完美
              </button>
            ) : (
              <span className="muted">透明擦除</span>
            )}
          </>
        )}
        {tool === 'bucket' && (
          <>
            <span>阈值</span>
            <input
              type="range"
              min={0}
              max={100}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
            />
            <span className="val">{threshold}%</span>
            <span className="muted">连续填充</span>
          </>
        )}
        {tool === 'dropper' && <span className="muted">取样 1×1 · 全部图层</span>}
        {tool === 'shade' && (
          <>
            {brushSizeControl}
            <span>明度</span>
            <input
              type="range"
              min={-100}
              max={100}
              value={deltaL}
              onChange={(e) => setDeltaL(Number(e.target.value))}
            />
            <span className="val">{deltaL}</span>
            <span>饱和</span>
            <input
              type="range"
              min={-100}
              max={100}
              value={deltaS}
              onChange={(e) => setDeltaS(Number(e.target.value))}
            />
            <span className="val">{deltaS}</span>
          </>
        )}
        {tool === 'select' && (
          <>
            <span className="muted">矩形 / 套索 / 魔棒</span>
            <button className="chipbtn" onClick={() => setSheet('selection')}>
              选择选区工具
            </button>
          </>
        )}
      </div>

      <div className="palette">
        <button className="wheel-btn" aria-label="颜色" onClick={() => setSheet('color')}>
          <span style={{ color, opacity: alpha / 255 }} />
        </button>
        {(palette.length ? palette : DEFAULT_SWATCHES).map((c) => (
          <button
            key={c}
            className={`swatch ${color.toUpperCase() === c ? 'sel' : ''}`}
            style={{ background: c }}
            aria-label={c}
            onClick={() => {
              setColor(c);
              setAlpha(255);
            }}
          />
        ))}
        <button
          className="ok"
          aria-label="应用颜色"
          onClick={() => {
            if (sheet === 'color') setSheet(null);
            else showToast(`当前色 ${color} · 色板 ${palette.length}/${MAX_PALETTE}`);
          }}
        >
          <Check size={20} />
        </button>
      </div>

      <div className="toolbar">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={`tool ${tool === t.id ? 'active' : ''}`}
            onClick={() => setTool(t.id)}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
        <button className="tool" disabled={hist.u === 0} onClick={undo}>
          <Undo />
          撤销
        </button>
        <button className="tool" disabled={hist.r === 0} onClick={redo}>
          <Redo />
          重做
        </button>
        <button
          className={`tool ${tool === 'select' ? 'active' : ''}`}
          onClick={() => setSheet('selection')}
        >
          <Marquee />
          选区
        </button>
      </div>

      {sheet === 'color' && (
        <ColorSheet
          color={color}
          alpha={alpha}
          palette={palette}
          onChange={setColor}
          onAlpha={setAlpha}
        />
      )}
      {sheet === 'layers' && (
        <LayersSheet
          layers={layers}
          activeIndex={layerIndex}
          onSelect={setLayerIndex}
          onReorder={reorderLayers}
        />
      )}
      {sheet === 'selection' && (
        <SelectionSheet
          onPick={() => {
            setTool('select');
            setSheet(null);
            showToast('选区引擎：M2 接入');
          }}
        />
      )}
      {sheet === 'effects' && <EffectsSheet onNoise={applyNoise} />}
      {sheet === 'help' && <HelpSheet />}
    </div>
  );
}
