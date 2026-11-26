import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
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
import { cloneBuffer } from '../core/pixels';
import {
  BLEND_TO_GCO,
  activeLayer,
  compositeLayers,
  createLayer,
  ensureLayers,
  fullRect,
  type Rect,
} from '../core/layers';
import type { BlendMode, Layer, LayerGroup, Overlay as OverlayData } from '../core/types';
import {
  ColorSheet,
  EffectsSheet,
  HelpSheet,
  LayersSheet,
  OverlaySheet,
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

interface LayerSnap {
  kind: 'layer';
  id: string;
  pixels: Uint8ClampedArray;
}
interface DocSnap {
  kind: 'doc';
  layers: Layer[];
  activeId: string;
}
type Snap = LayerSnap | DocSnap;

function cloneLayers(layers: Layer[]): Layer[] {
  return layers.map((l) => ({ ...l, pixels: cloneBuffer(l.pixels) }));
}

export function EditorScreen() {
  const project = useApp((s) => s.projects.find((p) => p.id === s.activeId));
  const sheet = useApp((s) => s.sheet);
  const setSheet = useApp((s) => s.setSheet);
  const closeProject = useApp((s) => s.closeProject);
  const updateProjectLayers = useApp((s) => s.updateProjectLayers);
  const updateProjectOverlay = useApp((s) => s.updateProjectOverlay);
  const updateProjectPalette = useApp((s) => s.updateProjectPalette);
  const showToast = useApp((s) => s.showToast);

  const width = project?.width ?? 64;
  const height = project?.height ?? 64;

  const initialLayers = useMemo<Layer[]>(() => {
    if (project) return ensureLayers(project);
    return [createLayer(width, height, '图层 1')];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [layers, setLayers] = useState<Layer[]>(initialLayers);
  const [activeId, setActiveId] = useState<string>(
    () => project?.activeLayerId ?? initialLayers[0].id,
  );
  const active = activeLayer(layers, activeId);
  const activeIndex = Math.max(0, layers.findIndex((l) => l.id === active?.id));

  const [color, setColor] = useState('#1F2937');
  const [alpha, setAlpha] = useState(255);
  const [palette, setPalette] = useState<string[]>(() => project?.palette ?? []);
  const paletteRef = useRef(palette);
  paletteRef.current = palette;

  const [groups, setGroups] = useState<LayerGroup[]>(() => project?.groups ?? []);
  const [overlay, setOverlay] = useState<OverlayData | undefined>(project?.overlay);
  const overlayImg = useRef<HTMLImageElement | null>(null);
  const layersRef = useRef(layers);
  layersRef.current = layers;

  const [tool, setTool] = useState<ToolId>('pencil');
  const [brush, setBrush] = useState(1);
  const [zoom, setZoom] = useState(() => {
    const availW = Math.min(window.innerWidth, 430) - 32;
    const availH = window.innerHeight * 0.56;
    const fit = Math.min(availW / width, availH / height);
    return Math.max(0.1, Math.min(64, Math.round(fit * 100) / 100));
  });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const centered = useRef(false);
  const [version, setVersion] = useState(0);
  const [pixelPerfect, setPixelPerfect] = useState(true);
  const [threshold, setThreshold] = useState(0);
  const [deltaL, setDeltaL] = useState(0);
  const [deltaS, setDeltaS] = useState(0);

  const composite = useMemo(() => document.createElement('canvas'), []);
  const layerCanvases = useRef(new Map<string, HTMLCanvasElement>());

  const undoRef = useRef<Snap[]>([]);
  const redoRef = useRef<Snap[]>([]);
  const [hist, setHist] = useState({ u: 0, r: 0 });
  const syncHist = () => setHist({ u: undoRef.current.length, r: redoRef.current.length });

  const layerCanvas = (layer: Layer) => {
    let c = layerCanvases.current.get(layer.id);
    if (!c) {
      c = document.createElement('canvas');
      c.width = width;
      c.height = height;
      layerCanvases.current.set(layer.id, c);
    }
    return c;
  };

  const paintLayerCanvas = (layer: Layer, rect?: Rect) => {
    const c = layerCanvas(layer);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const img = new ImageData(
      layer.pixels as unknown as Uint8ClampedArray<ArrayBuffer>,
      width,
      height,
    );
    if (!rect) {
      ctx.clearRect(0, 0, width, height);
      ctx.putImageData(img, 0, 0);
    } else {
      ctx.putImageData(img, 0, 0, rect.x, rect.y, rect.w, rect.h);
    }
  };

  const recomposite = (rect: Rect, list: Layer[]) => {
    const ctx = composite.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(rect.x, rect.y, rect.w, rect.h);
    if (overlay?.visible && overlayImg.current?.complete) {
      ctx.globalAlpha = overlay.opacity;
      ctx.drawImage(
        overlayImg.current,
        rect.x,
        rect.y,
        rect.w,
        rect.h,
        rect.x,
        rect.y,
        rect.w,
        rect.h,
      );
      ctx.globalAlpha = 1;
    }
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const layer = list[i];
      if (!layer.visible || layer.opacity <= 0) continue;
      ctx.globalAlpha = layer.opacity;
      ctx.globalCompositeOperation = BLEND_TO_GCO[layer.blend] ?? 'source-over';
      ctx.drawImage(
        layerCanvas(layer),
        rect.x,
        rect.y,
        rect.w,
        rect.h,
        rect.x,
        rect.y,
        rect.w,
        rect.h,
      );
    }
    ctx.restore();
  };

  const rebuild = (list: Layer[]) => {
    for (const key of [...layerCanvases.current.keys()]) {
      if (!list.some((l) => l.id === key)) layerCanvases.current.delete(key);
    }
    list.forEach((l) => paintLayerCanvas(l));
    recomposite(fullRect(width, height), list);
    setVersion((v) => v + 1);
  };

  useEffect(() => {
    composite.width = width;
    composite.height = height;
    layerCanvases.current.clear();
    rebuild(layersRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height]);

  useEffect(() => {
    if (!overlay?.dataUrl) {
      overlayImg.current = null;
      rebuild(layersRef.current);
      return;
    }
    const img = new Image();
    img.onload = () => {
      overlayImg.current = img;
      rebuild(layersRef.current);
    };
    img.src = overlay.dataUrl;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlay?.dataUrl]);

  useEffect(() => {
    rebuild(layersRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlay?.visible, overlay?.opacity]);

  const applyDoc = (next: Layer[], nextActive: string) => {
    setLayers(next);
    setActiveId(nextActive);
    rebuild(next);
  };

  const pushDoc = () => {
    undoRef.current.push({ kind: 'doc', layers: cloneLayers(layers), activeId });
    if (undoRef.current.length > 30) undoRef.current.shift();
    redoRef.current = [];
    syncHist();
  };

  const restore = (snap: Snap) => {
    if (snap.kind === 'layer') {
      const current = layers.map((l) =>
        l.id === snap.id ? { ...l, pixels: new Uint8ClampedArray(snap.pixels) } : l,
      );
      setLayers(current);
      rebuild(current);
      return;
    }
    const next = cloneLayers(snap.layers);
    setLayers(next);
    setActiveId(snap.activeId);
    rebuild(next);
  };

  const currentSnap = (snap: Snap): Snap => {
    if (snap.kind === 'layer') {
      const l = layers.find((x) => x.id === snap.id);
      return {
        kind: 'layer',
        id: snap.id,
        pixels: l ? cloneBuffer(l.pixels) : new Uint8ClampedArray(0),
      };
    }
    return { kind: 'doc', layers: cloneLayers(layers), activeId };
  };

  const undo = () => {
    const snap = undoRef.current.pop();
    if (!snap) return;
    redoRef.current.push(currentSnap(snap));
    restore(snap);
    syncHist();
  };

  const redo = () => {
    const snap = redoRef.current.pop();
    if (!snap) return;
    undoRef.current.push(currentSnap(snap));
    restore(snap);
    syncHist();
  };

  const beginStroke = () => {
    if (!active || active.locked) return;
    undoRef.current.push({
      kind: 'layer',
      id: active.id,
      pixels: cloneBuffer(active.pixels),
    });
    if (undoRef.current.length > 30) undoRef.current.shift();
    redoRef.current = [];
    syncHist();
    if (tool === 'pencil' || tool === 'bucket') rememberColor(color);
  };

  const rememberColor = (hex: string) => {
    if (paletteRef.current.includes(hex)) return;
    const next = [hex, ...paletteRef.current].slice(0, MAX_PALETTE);
    setPalette(next);
    if (project) updateProjectPalette(project.id, next);
  };

  const handleDirty = (rect: Rect) => {
    if (!active) return;
    paintLayerCanvas(active, rect);
    recomposite(rect, layers);
    setVersion((v) => v + 1);
  };

  const applyNoise = (amount: number) => {
    if (!active || active.locked) return;
    undoRef.current.push({ kind: 'layer', id: active.id, pixels: cloneBuffer(active.pixels) });
    redoRef.current = [];
    syncHist();
    const buf = active.pixels;
    const strength = (amount / 100) * 90;
    for (let i = 0; i < buf.length; i += 4) {
      if (buf[i + 3] === 0) continue;
      const d = (Math.random() * 2 - 1) * strength;
      buf[i] = Math.max(0, Math.min(255, buf[i] + d));
      buf[i + 1] = Math.max(0, Math.min(255, buf[i + 1] + d));
      buf[i + 2] = Math.max(0, Math.min(255, buf[i + 2] + d));
    }
    rebuild(layers);
    setSheet(null);
    showToast('已应用噪点');
  };

  const saveAndClose = () => {
    if (project) updateProjectLayers(project.id, layers, active.id, groups);
    closeProject();
    showToast('已保存');
  };

  const selectLayer = (id: string) => setActiveId(id);

  const reorderLayers = (from: number, to: number) => {
    if (from === to) return;
    pushDoc();
    const next = [...layers];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    applyDoc(next, activeId);
  };

  const toggleVisible = (id: string) => {
    const next = layers.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l));
    setLayers(next);
    rebuild(next);
  };

  const setOpacity = (id: string, value: number) => {
    const next = layers.map((l) => (l.id === id ? { ...l, opacity: value } : l));
    setLayers(next);
    rebuild(next);
  };

  const setBlend = (id: string, blend: BlendMode) => {
    const next = layers.map((l) => (l.id === id ? { ...l, blend } : l));
    setLayers(next);
    rebuild(next);
  };

  const addLayer = () => {
    pushDoc();
    const layer = createLayer(width, height, `图层 ${layers.length + 1}`);
    const idx = Math.max(0, layers.findIndex((l) => l.id === active?.id));
    const next = [...layers];
    next.splice(idx, 0, layer);
    applyDoc(next, layer.id);
  };

  const duplicateLayer = () => {
    if (!active) return;
    pushDoc();
    const copy = createLayer(width, height, `${active.name} 副本`, cloneBuffer(active.pixels));
    copy.opacity = active.opacity;
    copy.blend = active.blend;
    copy.groupId = active.groupId ?? null;
    const idx = Math.max(0, layers.findIndex((l) => l.id === active.id));
    const next = [...layers];
    next.splice(idx, 0, copy);
    applyDoc(next, copy.id);
  };

  const deleteLayer = () => {
    if (layers.length <= 1 || !active) return;
    pushDoc();
    const idx = layers.findIndex((l) => l.id === active.id);
    const next = layers.filter((l) => l.id !== active.id);
    applyDoc(next, next[Math.min(idx, next.length - 1)].id);
  };

  const addGroup = () => {
    const g: LayerGroup = {
      id: `grp_${Date.now().toString(36)}`,
      name: `文件夹 ${groups.length + 1}`,
      expanded: true,
    };
    const nextGroups = [...groups, g];
    setGroups(nextGroups);
    if (active) assignGroup(active.id, g.id, nextGroups);
  };

  const toggleGroup = (id: string) => {
    setGroups(groups.map((g) => (g.id === id ? { ...g, expanded: !g.expanded } : g)));
  };

  const assignGroup = (layerId: string, groupId: string | null, groupList = groups) => {
    const layer = layers.find((l) => l.id === layerId);
    if (!layer) return;
    const updated = layers.map((l) => (l.id === layerId ? { ...l, groupId } : l));
    // 让同组图层保持连续：移到该组第一个成员旁边
    const arr = updated.filter((l) => l.id !== layerId);
    const moved = updated.find((l) => l.id === layerId)!;
    if (groupId) {
      const firstIdx = arr.findIndex((l) => l.groupId === groupId);
      arr.splice(firstIdx >= 0 ? firstIdx : arr.length, 0, moved);
    } else {
      arr.push(moved);
    }
    applyDoc(arr, layerId);
    if (project) updateProjectLayers(project.id, arr, layerId, groupList);
  };

  const mergeDown = () => {
    if (!active) return;
    const idx = layers.findIndex((l) => l.id === active.id);
    if (idx < 0 || idx >= layers.length - 1) {
      showToast('最底层无法向下合并');
      return;
    }
    pushDoc();
    const below = layers[idx + 1];
    // 模型是「上面在前」，合成顺序需要下层在前
    const merged = compositeLayers([below, active], width, height);
    const layer = createLayer(width, height, below.name, merged);
    layer.opacity = below.opacity;
    layer.blend = below.blend;
    const next = [...layers];
    next.splice(idx, 2, layer);
    applyDoc(next, layer.id);
  };

  return (
    <div className="ed">
      <header className="ed-top">
        <button className="icon-btn" aria-label="关闭并保存" onClick={saveAndClose}>
          <Close size={22} />
        </button>

        <div className="seg">
          <button
            className="icon-btn chev"
            aria-label="上一个图层"
            onClick={() => {
              if (layers.length < 2) return;
              setActiveId(layers[(activeIndex + 1) % layers.length].id);
            }}
          >
            <ChevronLeft size={18} />
          </button>
          <button className="chip" onClick={() => setSheet('layers')}>
            <LayersIcon size={16} />
            <span>{active?.name ?? '图层'}</span>
          </button>
          <button
            className="icon-btn chev"
            aria-label="下一个图层"
            onClick={() => {
              if (layers.length < 2) return;
              setActiveId(layers[(activeIndex - 1 + layers.length) % layers.length].id);
            }}
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="spacer" />

        <button
          className="icon-btn"
          aria-label="参考底图"
          onClick={() => setSheet('overlay')}
        >
          <Overlay size={22} />
        </button>
        <button className="icon-btn" aria-label="效果" onClick={() => setSheet('effects')}>
          <Sparkles size={22} />
        </button>
        <button className="icon-btn accent" aria-label="保存" onClick={saveAndClose}>
          <Check size={23} />
        </button>
      </header>

      <div className="ed-body">
        <div className="stage-wrap">
          <CanvasStage
            width={width}
            height={height}
            source={composite}
            version={version}
            activePixels={active && !active.locked ? active.pixels : null}
            tool={tool}
            color={color}
            alpha={alpha}
            brush={brush}
            zoom={zoom}
            pan={pan}
            shadeL={deltaL}
            shadeS={deltaS}
            onZoom={setZoom}
            onPan={setPan}
            onBeginStroke={beginStroke}
            onDirty={handleDirty}
            onViewport={(vw, vh) => {
              if (centered.current) return;
              centered.current = true;
              setPan({ x: (vw - width * zoom) / 2, y: (vh - height * zoom) / 2 });
            }}
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
            {tool === 'pencil' && (
              <button
                className={`toggle ${pixelPerfect ? 'on' : ''}`}
                onClick={() => setPixelPerfect((v) => !v)}
              >
                <span className="dot">{pixelPerfect ? <Check size={11} /> : null}</span>
                像素完美
              </button>
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
        {tool === 'dropper' && <span className="muted">取样 1×1 · 合成结果</span>}
        {tool === 'shade' && (
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
      {sheet === 'layers' && active && (
        <LayersSheet
          layers={layers}
          groups={groups}
          activeId={active.id}
          onSelect={selectLayer}
          onReorder={reorderLayers}
          onToggle={toggleVisible}
          onOpacity={setOpacity}
          onBlend={setBlend}
          onAdd={addLayer}
          onDuplicate={duplicateLayer}
          onDelete={deleteLayer}
          onMerge={mergeDown}
          onAddGroup={addGroup}
          onToggleGroup={toggleGroup}
          onAssignGroup={assignGroup}
        />
      )}
      {sheet === 'overlay' && (
        <OverlaySheet
          overlay={overlay}
          onImport={(dataUrl) => {
            const next = { dataUrl, opacity: 0.4, visible: true };
            setOverlay(next);
            if (project) updateProjectOverlay(project.id, next);
          }}
          onToggle={() => {
            if (!overlay) return;
            const next = { ...overlay, visible: !overlay.visible };
            setOverlay(next);
            if (project) updateProjectOverlay(project.id, next);
          }}
          onOpacity={(v) => {
            if (!overlay) return;
            const next = { ...overlay, opacity: v };
            setOverlay(next);
            if (project) updateProjectOverlay(project.id, next);
          }}
          onRemove={() => {
            setOverlay(undefined);
            if (project) updateProjectOverlay(project.id, undefined);
          }}
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
