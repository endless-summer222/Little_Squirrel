import { useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../state/useApp';
import {
  CanvasStage,
  type SelectShape,
  type SelectTool,
  type ToolId,
} from '../components/CanvasStage';
import {
  Bulb,
  Bucket,
  Copy,
  Cut,
  Ellipse,
  Expand,
  FlipH,
  Grid,
  FlipV,
  Lasso,
  Move,
  Paste,
  RectIcon,
  Shrink,
  Wand,
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
  Share,
  Sparkles,
  Undo,
} from '../components/icons';
import { adjustPixel, cloneBuffer, parseHex, toHex } from '../core/pixels';
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
  combineMask,
  ellipseMask,
  invertMask,
  magicWand,
  makeSelection,
  morphMask,
  polygonMask,
  rectMask,
  selectionPath,
  translateMask,
  type SelMode,
  type Selection,
} from '../core/selection';
import {
  ColorSheet,
  EffectsSheet,
  HelpSheet,
  ExportSheet,
  GridSheet,
  LayersSheet,
  OverlaySheet,
} from './Sheets';
import { saveProjectPng } from '../core/export';

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

function DropMenu({
  anchorRef,
  open,
  onClose,
  children,
}: {
  anchorRef: RefObject<HTMLButtonElement | null>;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;
  const r = anchorRef.current?.getBoundingClientRect();
  const left = Math.max(8, Math.min(r?.left ?? 8, window.innerWidth - 172));
  const top = (r?.top ?? 240) - 8;
  return createPortal(
    <>
      <div className="mode-backdrop" onClick={onClose} />
      <div
        className="mode-menu"
        style={{ position: 'fixed', left, top, bottom: 'auto', transform: 'translateY(-100%)' }}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}

interface Floating {
  pixels: Uint8ClampedArray;
  origPixels: Uint8ClampedArray;
  mask: Uint8Array;
  origMask: Uint8Array;
  x: number;
  y: number;
  w: number;
  h: number;
  ox: number;
  oy: number;
}

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
  const [hand, setHand] = useState(false);
  const handTimer = useRef(0);
  const [brush, setBrush] = useState(1);
  const [zoom, setZoom] = useState(() => {
    const availW = Math.min(window.innerWidth, 430) - 32;
    const availH = window.innerHeight * 0.56;
    const fit = Math.min(availW / width, availH / height);
    return Math.max(0.1, Math.min(64, Math.round(fit * 100) / 100));
  });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const centered = useRef(false);
  const [vp, setVp] = useState({ w: 0, h: 0 });
  const strokeActive = useRef(false);
  const [version, setVersion] = useState(0);
  const [pixelPerfect, setPixelPerfect] = useState(true);
  const [threshold, setThreshold] = useState(0);
  const [contiguous, setContiguous] = useState(true);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [selPath, setSelPath] = useState<Path2D | null>(null);
  const [selTool, setSelTool] = useState<SelectTool>('rect');
  const [selMode, setSelMode] = useState<SelMode>('new');
  const [modeMenu, setModeMenu] = useState(false);
  const [toolMenu, setToolMenu] = useState(false);
  const toolBtnRef = useRef<HTMLButtonElement>(null);
  const modeBtnRef = useRef<HTMLButtonElement>(null);
  const [gridColor, setGridColor] = useState(() =>
    typeof localStorage === 'undefined' ? '#FFFFFF' : localStorage.getItem('pixeluv.gridColor') ?? '#FFFFFF',
  );
  const [gridOn, setGridOn] = useState(() =>
    typeof localStorage === 'undefined' ? false : localStorage.getItem('pixeluv.gridOn') === '1',
  );
  const [gridStep, setGridStep] = useState(() => {
    const v = typeof localStorage === 'undefined' ? 1 : Number(localStorage.getItem('pixeluv.gridStep'));
    return [1, 2, 4, 8, 16, 32].includes(v) ? v : 1;
  });
  const [lastExport, setLastExport] = useState<string | undefined>(undefined);

  useEffect(() => {
    try {
      localStorage.setItem('pixeluv.gridColor', gridColor);
      localStorage.setItem('pixeluv.gridOn', gridOn ? '1' : '0');
      localStorage.setItem('pixeluv.gridStep', String(gridStep));
    } catch {
      // ignore
    }
  }, [gridColor, gridOn, gridStep]);

  const [floating, setFloating] = useState<Floating | null>(null);
  const floatingRef = useRef<Floating | null>(null);
  floatingRef.current = floating;
  const floatCanvas = useRef<HTMLCanvasElement | null>(null);
  const [clipboard, setClipboard] = useState<
    { x: number; y: number; w: number; h: number; pixels: Uint8ClampedArray } | null
  >(null);
  const [selOffset, setSelOffset] = useState({ x: 0, y: 0 });
  const moveBase = useRef<Uint8ClampedArray | null>(null);
  const moveOrigMask = useRef<Uint8Array | null>(null);
  const moveDelta = useRef({ x: 0, y: 0 });
  const moveContent = useRef<
    { x: number; y: number; w: number; h: number; pixels: Uint8ClampedArray } | null
  >(null);
  const [deltaL, setDeltaL] = useState(0);
  const [deltaS, setDeltaS] = useState(0);

  const composite = useMemo(() => document.createElement('canvas'), []);
  const layerCanvases = useRef(new Map<string, HTMLCanvasElement>());

  const undoRef = useRef<Snap[]>([]);
  const redoRef = useRef<Snap[]>([]);
  const [hist, setHist] = useState({ u: 0, r: 0 });
  const syncHist = () => setHist({ u: undoRef.current.length, r: redoRef.current.length });

  const snapBytes = (snap: Snap): number => {
    if (snap.kind === 'layer') return snap.pixels.byteLength + 64;
    return snap.layers.reduce((n, l) => n + l.pixels.byteLength + 128, 0);
  };

  const trimUndo = () => {
    const MAX = 100;
    const LIMIT = 64 * 1024 * 1024;
    let bytes = undoRef.current.reduce((n, s) => n + snapBytes(s), 0);
    while (undoRef.current.length > MAX || (bytes > LIMIT && undoRef.current.length > 1)) {
      const dropped = undoRef.current.shift();
      if (!dropped) break;
      bytes -= snapBytes(dropped);
    }
  };

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
    const f = floatingRef.current;
    if (f) {
      const fc = floatCanvas.current;
      if (fc) {
        const ix = Math.max(rect.x, f.x);
        const iy = Math.max(rect.y, f.y);
        const ix2 = Math.min(rect.x + rect.w, f.x + f.w);
        const iy2 = Math.min(rect.y + rect.h, f.y + f.h);
        if (ix2 > ix && iy2 > iy) {
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
          ctx.drawImage(fc, ix - f.x, iy - f.y, ix2 - ix, iy2 - iy, ix, iy, ix2 - ix, iy2 - iy);
        }
      }
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
    if (!overlay?.dataUrl || overlay.dataUrl.length > 1_500_000) {
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
    trimUndo();
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
    if (floatingRef.current) {
      setFloating(null);
      floatingRef.current = null;
      syncFloatCanvas(null);
    }
    const snap = undoRef.current.pop();
    if (!snap) return;
    redoRef.current.push(currentSnap(snap));
    restore(snap);
    syncHist();
  };

  const redo = () => {
    if (floatingRef.current) {
      setFloating(null);
      floatingRef.current = null;
      syncFloatCanvas(null);
    }
    const snap = redoRef.current.pop();
    if (!snap) return;
    undoRef.current.push(currentSnap(snap));
    restore(snap);
    syncHist();
  };

  const beginStroke = () => {
    if (!active || active.locked) return;
    strokeActive.current = true;
    lastStrokeAt.current = performance.now();
    undoRef.current.push({
      kind: 'layer',
      id: active.id,
      pixels: cloneBuffer(active.pixels),
    });
    trimUndo();
    redoRef.current = [];
    syncHist();
    if (tool === 'pencil' || tool === 'bucket') rememberColor(color);
  };

  const removePalette = (hex: string) => {
    const next = paletteRef.current.filter((c) => c !== hex);
    setPalette(next);
    if (project) updateProjectPalette(project.id, next);
  };

  const clearPalette = () => {
    setPalette([]);
    if (project) updateProjectPalette(project.id, []);
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

  useEffect(() => {
    if (tool !== 'select' && floatingRef.current) confirmFloating();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);

  useEffect(() => {
    if (!project) return;
    const t = window.setTimeout(() => {
      updateProjectLayers(project.id, layers, activeId, groups);
    }, 1200);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers, activeId, groups]);

  const saveAndClose = () => {
    if (project) updateProjectLayers(project.id, layers, active.id, groups);
    closeProject();
    showToast('已保存');
  };

  const selectLayer = (id: string) => setActiveId(id);

  const toggleAlphaLock = (id: string) => {
    const next = layers.map((l) => (l.id === id ? { ...l, alphaLock: !l.alphaLock } : l));
    setLayers(next);
    rebuild(next);
  };

  const renameLayer = (id: string, name: string) => {
    const next = layers.map((l) => (l.id === id ? { ...l, name } : l));
    setLayers(next);
    rebuild(next);
  };

  const clearLayer = () => {
    if (!active) return;
    pushLayerSnap();
    active.pixels.fill(0);
    rebuild(layers);
  };

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

  const setSelMask = (mask: Uint8Array) => {
    const sel = makeSelection(mask, width, height);
    if (sel.bounds.w === 0) {
      setSelection(null);
      setSelPath(null);
      return;
    }
    setSelection(sel);
    setSelPath(selectionPath(mask, width, height));
  };

  const handleSelectShape = (shape: SelectShape) => {
    if (floatingRef.current) confirmFloating();
    if (!active) return;
    let next: Uint8Array;
    if (shape.kind === 'rect') next = rectMask(width, height, shape.rect);
    else if (shape.kind === 'ellipse') next = ellipseMask(width, height, shape.rect);
    else if (shape.kind === 'lasso') next = polygonMask(width, height, shape.points);
    else {
      next = magicWand(active.pixels, width, height, shape.x, shape.y, {
        tolerance: Math.round(threshold * 2.55),
        contiguous,
        sample: 'layer',
      });
    }
    setSelMask(combineMask(selection?.mask ?? null, next, selMode));
  };

  const extractRect = (x: number, y: number, w: number, h: number) => {
    const out = new Uint8ClampedArray(w * h * 4);
    if (!active) return out;
    for (let dy = 0; dy < h; dy += 1) {
      for (let dx = 0; dx < w; dx += 1) {
        const sx = x + dx;
        const sy = y + dy;
        if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
        const si = (sy * width + sx) * 4;
        const di = (dy * w + dx) * 4;
        out[di] = active.pixels[si];
        out[di + 1] = active.pixels[si + 1];
        out[di + 2] = active.pixels[si + 2];
        out[di + 3] = active.pixels[si + 3];
      }
    }
    return out;
  };

  const extractMasked = (
    x: number,
    y: number,
    w: number,
    h: number,
    mask: Uint8Array,
  ) => {
    const out = extractRect(x, y, w, h);
    for (let dy = 0; dy < h; dy += 1) {
      for (let dx = 0; dx < w; dx += 1) {
        const gx = x + dx;
        const gy = y + dy;
        if (gx < 0 || gy < 0 || gx >= width || gy >= height) continue;
        if (mask[gy * width + gx]) continue;
        const i = (dy * w + dx) * 4;
        out[i] = 0;
        out[i + 1] = 0;
        out[i + 2] = 0;
        out[i + 3] = 0;
      }
    }
    return out;
  };

  const clearMaskPixels = (buf: Uint8ClampedArray, mask: Uint8Array) => {
    for (let i = 0; i < mask.length; i += 1) {
      if (!mask[i]) continue;
      const p = i * 4;
      buf[p] = 0;
      buf[p + 1] = 0;
      buf[p + 2] = 0;
      buf[p + 3] = 0;
    }
  };

  const blitContent = (
    buf: Uint8ClampedArray,
    content: { x: number; y: number; w: number; h: number; pixels: Uint8ClampedArray },
  ) => {
    for (let dy = 0; dy < content.h; dy += 1) {
      for (let dx = 0; dx < content.w; dx += 1) {
        const x = content.x + dx;
        const y = content.y + dy;
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const si = (dy * content.w + dx) * 4;
        if (content.pixels[si + 3] === 0) continue;
        const di = (y * width + x) * 4;
        buf[di] = content.pixels[si];
        buf[di + 1] = content.pixels[si + 1];
        buf[di + 2] = content.pixels[si + 2];
        buf[di + 3] = content.pixels[si + 3];
      }
    }
  };

  const pushLayerSnap = () => {
    if (!active) return;
    undoRef.current.push({ kind: 'layer', id: active.id, pixels: cloneBuffer(active.pixels) });
    trimUndo();
    redoRef.current = [];
    syncHist();
  };

  const onMoveStart = () => {
    if (!active || !selection) return;
    if (floatingRef.current) {
      moveOrigMask.current = selection.mask.slice();
      moveDelta.current = { x: 0, y: 0 };
      setSelOffset({ x: 0, y: 0 });
      return;
    }
    pushLayerSnap();
    moveOrigMask.current = selection.mask.slice();
    moveDelta.current = { x: 0, y: 0 };
    setSelOffset({ x: 0, y: 0 });
    const b = selection.bounds;
    const content = {
      x: b.x,
      y: b.y,
      w: b.w,
      h: b.h,
      pixels: extractMasked(b.x, b.y, b.w, b.h, selection.mask),
    };
    const base = cloneBuffer(active.pixels);
    clearMaskPixels(base, selection.mask);
    moveBase.current = base;
    moveContent.current = content;
    active.pixels.set(base);
    blitContent(active.pixels, content);
    paintLayerCanvas(active);
    recomposite(fullRect(width, height), layers);
    setVersion((v) => v + 1);
  };

  const onMoveDelta = (dx: number, dy: number) => {
    if (!active) return;
    if (floatingRef.current) {
      const f = { ...floatingRef.current, x: floatingRef.current.ox + dx, y: floatingRef.current.oy + dy };
      setFloating(f);
      floatingRef.current = f;
      moveDelta.current = { x: dx, y: dy };
      setSelOffset({ x: dx, y: dy });
      recomposite(fullRect(width, height), layers);
      setVersion((v) => v + 1);
      return;
    }
    if (!moveBase.current || !moveContent.current) return;
    moveDelta.current = { x: dx, y: dy };
    setSelOffset({ x: dx, y: dy });
    active.pixels.set(moveBase.current);
    blitContent(active.pixels, {
      ...moveContent.current,
      x: moveContent.current.x + dx,
      y: moveContent.current.y + dy,
    });
    paintLayerCanvas(active);
    recomposite(fullRect(width, height), layers);
    setVersion((v) => v + 1);
  };

  const onMoveEnd = () => {
    const mask = moveOrigMask.current;
    const d = moveDelta.current;
    if (mask && (d.x !== 0 || d.y !== 0)) {
      const shifted = translateMask(mask, width, height, d.x, d.y);
      const sel = makeSelection(shifted, width, height);
      setSelection(sel.bounds.w ? sel : null);
      setSelPath(sel.bounds.w ? selectionPath(shifted, width, height) : null);
    }
    setSelOffset({ x: 0, y: 0 });
    moveBase.current = null;
    moveContent.current = null;
    moveOrigMask.current = null;
    moveDelta.current = { x: 0, y: 0 };
  };

  const copySelection = (cut: boolean) => {
    if (!active || !selection) return;
    const b = selection.bounds;
    const content = { x: b.x, y: b.y, w: b.w, h: b.h, pixels: extractMasked(b.x, b.y, b.w, b.h, selection.mask) };
    setClipboard(content);
    if (cut) {
      pushLayerSnap();
      const mask = selection.mask;
      for (let i = 0; i < mask.length; i += 1) {
        if (!mask[i]) continue;
        const p = i * 4;
        active.pixels[p] = 0;
        active.pixels[p + 1] = 0;
        active.pixels[p + 2] = 0;
        active.pixels[p + 3] = 0;
      }
      paintLayerCanvas(active);
      recomposite(fullRect(width, height), layers);
      setVersion((v) => v + 1);
    }
    showToast(cut ? '已剪切选区' : '已复制选区');
  };

  const pasteSelection = () => {
    if (!clipboard) return;
    pushDoc();
    const layer = createLayer(width, height, '粘贴图层', cloneBuffer(clipboard.pixels));
    // 放到画布内的居中位置
    const nx = Math.max(0, Math.min(width - clipboard.w, Math.round((width - clipboard.w) / 2)));
    const ny = Math.max(0, Math.min(height - clipboard.h, Math.round((height - clipboard.h) / 2)));
    blitContent(layer.pixels, { ...clipboard, x: nx, y: ny });
    const next = [layer, ...layers];
    applyDoc(next, layer.id);
    showToast('已粘贴为新图层');
  };

  const transformSelection = (kind: 'flipH' | 'flipV') => {
    if (!active || !selection) return;
    pushLayerSnap();
    const b = selection.bounds;
    const src = extractMasked(b.x, b.y, b.w, b.h, selection.mask);
    const out = new Uint8ClampedArray(src.length);
    for (let y = 0; y < b.h; y += 1) {
      for (let x = 0; x < b.w; x += 1) {
        const sx = kind === 'flipH' ? b.w - 1 - x : x;
        const sy = kind === 'flipV' ? b.h - 1 - y : y;
        const si = (sy * b.w + sx) * 4;
        const di = (y * b.w + x) * 4;
        out[di] = src[si];
        out[di + 1] = src[si + 1];
        out[di + 2] = src[si + 2];
        out[di + 3] = src[si + 3];
      }
    }
    clearMaskPixels(active.pixels, selection.mask);
    blitContent(active.pixels, { x: b.x, y: b.y, w: b.w, h: b.h, pixels: out });
    const nm = new Uint8Array(selection.mask.length);
    for (let y = 0; y < b.h; y += 1) {
      for (let x = 0; x < b.w; x += 1) {
        const sx = kind === 'flipH' ? b.w - 1 - x : x;
        const sy = kind === 'flipV' ? b.h - 1 - y : y;
        if (!selection.mask[(b.y + sy) * width + (b.x + sx)]) continue;
        nm[(b.y + y) * width + (b.x + x)] = 1;
      }
    }
    setSelMask(nm);
    paintLayerCanvas(active);
    recomposite(fullRect(width, height), layers);
    setVersion((v) => v + 1);
  };

  const selInvert = () => selection && setSelMask(invertMask(selection.mask));
  const selClear = () => {
    if (floatingRef.current) confirmFloating();
    setSelection(null);
    setSelPath(null);
  };
  const selGrow = (n: number) => selection && setSelMask(morphMask(selection.mask, width, height, n));
  const selFill = () => {
    if (!active || !selection) return;
    pushLayerSnap();
    const mask = selection.mask;
    const c = { ...parseHex(color), a: alpha };
    for (let i = 0; i < mask.length; i += 1) {
      if (!mask[i]) continue;
      const p = i * 4;
      active.pixels[p] = c.r;
      active.pixels[p + 1] = c.g;
      active.pixels[p + 2] = c.b;
      active.pixels[p + 3] = c.a;
    }
    paintLayerCanvas(active);
    recomposite(fullRect(width, height), layers);
    setVersion((v) => v + 1);
  };
  const selClearPixels = () => {
    if (!active || !selection) return;
    pushLayerSnap();
    clearMaskPixels(active.pixels, selection.mask);
    paintLayerCanvas(active);
    recomposite(fullRect(width, height), layers);
    setVersion((v) => v + 1);
  };

  const adjustSelectionHSL = (dL: number, dS: number) => {
    if (!active || !selection) return;
    pushLayerSnap();
    const mask = selection.mask;
    for (let i = 0; i < mask.length; i += 1) {
      if (!mask[i]) continue;
      const p = i * 4;
      if (active.pixels[p + 3] === 0) continue;
      const out = adjustPixel(
        { r: active.pixels[p], g: active.pixels[p + 1], b: active.pixels[p + 2], a: active.pixels[p + 3] },
        dL,
        dS,
      );
      active.pixels[p] = out.r;
      active.pixels[p + 1] = out.g;
      active.pixels[p + 2] = out.b;
    }
    paintLayerCanvas(active);
    recomposite(fullRect(width, height), layers);
    setVersion((v) => v + 1);
    showToast('已调整选区明度/饱和度');
  };

  const syncFloatCanvas = (f: Floating | null) => {
    if (!f) {
      floatCanvas.current = null;
      return;
    }
    const c = document.createElement('canvas');
    c.width = f.w;
    c.height = f.h;
    const ctx = c.getContext('2d');
    if (ctx) ctx.putImageData(new ImageData(new Uint8ClampedArray(f.pixels), f.w, f.h), 0, 0);
    floatCanvas.current = c;
  };

  const cutToFloating = () => {
    if (!active || !selection) return;
    pushLayerSnap();
    const b = selection.bounds;
    const pixels = new Uint8ClampedArray(b.w * b.h * 4);
    const local = new Uint8Array(b.w * b.h);
    for (let y = 0; y < b.h; y += 1) {
      for (let x = 0; x < b.w; x += 1) {
        const li = y * b.w + x;
        if (!selection.mask[(b.y + y) * width + (b.x + x)]) continue;
        local[li] = 1;
        const gi = ((b.y + y) * width + (b.x + x)) * 4;
        const si = li * 4;
        pixels[si] = active.pixels[gi];
        pixels[si + 1] = active.pixels[gi + 1];
        pixels[si + 2] = active.pixels[gi + 2];
        pixels[si + 3] = active.pixels[gi + 3];
      }
    }
    clearMaskPixels(active.pixels, selection.mask);
    const f: Floating = {
      pixels,
      origPixels: new Uint8ClampedArray(pixels),
      mask: local,
      origMask: selection.mask.slice(),
      x: b.x,
      y: b.y,
      w: b.w,
      h: b.h,
      ox: b.x,
      oy: b.y,
    };
    setFloating(f);
    floatingRef.current = f;
    syncFloatCanvas(f);
    setClipboard({ x: b.x, y: b.y, w: b.w, h: b.h, pixels: new Uint8ClampedArray(pixels) });
    setSelTool('move');
    paintLayerCanvas(active);
    recomposite(fullRect(width, height), layers);
    setVersion((v) => v + 1);
    showToast('已剪切：拖动 / 翻转后点确认');
  };

  const confirmFloating = () => {
    if (!active || !floating) return;
    blitContent(active.pixels, {
      x: floating.x,
      y: floating.y,
      w: floating.w,
      h: floating.h,
      pixels: floating.pixels,
    });
    setFloating(null);
    floatingRef.current = null;
    syncFloatCanvas(null);
    paintLayerCanvas(active);
    recomposite(fullRect(width, height), layers);
    setVersion((v) => v + 1);
    showToast('已放置');
  };

  const cancelFloating = () => {
    if (!active || !floating) return;
    blitContent(active.pixels, {
      x: floating.ox,
      y: floating.oy,
      w: floating.w,
      h: floating.h,
      pixels: floating.origPixels,
    });
    setFloating(null);
    floatingRef.current = null;
    syncFloatCanvas(null);
    const sel = makeSelection(floating.origMask.slice(), width, height);
    setSelection(sel.bounds.w ? sel : null);
    setSelPath(sel.bounds.w ? selectionPath(floating.origMask, width, height) : null);
    paintLayerCanvas(active);
    recomposite(fullRect(width, height), layers);
    setVersion((v) => v + 1);
  };

  const flipFloating = (horizontal: boolean) => {
    if (!floating) return;
    const { w, h, pixels, mask } = floating;
    const out = new Uint8ClampedArray(pixels.length);
    const mout = new Uint8Array(mask.length);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const sx = horizontal ? w - 1 - x : x;
        const sy = horizontal ? y : h - 1 - y;
        const si = (sy * w + sx) * 4;
        const di = (y * w + x) * 4;
        out[di] = pixels[si];
        out[di + 1] = pixels[si + 1];
        out[di + 2] = pixels[si + 2];
        out[di + 3] = pixels[si + 3];
        mout[y * w + x] = mask[sy * w + sx];
      }
    }
    const f = { ...floating, pixels: out, mask: mout };
    setFloating(f);
    floatingRef.current = f;
    syncFloatCanvas(f);
    const gm = new Uint8Array(width * height);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        if (!mout[y * w + x]) continue;
        const gx = f.x + x;
        const gy = f.y + y;
        if (gx < 0 || gy < 0 || gx >= width || gy >= height) continue;
        gm[gy * width + gx] = 1;
      }
    }
    const sel = makeSelection(gm, width, height);
    setSelection(sel.bounds.w ? sel : null);
    setSelPath(sel.bounds.w ? selectionPath(gm, width, height) : null);
    recomposite(fullRect(width, height), layers);
    setVersion((v) => v + 1);
  };

  const cancelRecentStroke = () => {
    if (!strokeActive.current) return;
    const snap = undoRef.current.pop();
    if (snap && snap.kind === 'layer') {
      restore(snap);
      syncHist();
    }
    strokeActive.current = false;
  };

  const onStrokeEnd = () => {
    strokeActive.current = false;
  };

  const pickAt = (x: number, y: number) => {
    cancelRecentStroke();
    const ctx = composite.getContext('2d');
    if (!ctx) return;
    const d = ctx.getImageData(x, y, 1, 1).data;
    if (d[3] === 0) return;
    const hex = toHex({ r: d[0], g: d[1], b: d[2], a: d[3] });
    setColor(hex);
    setAlpha(255);
    rememberColor(hex);
    showToast(`已取色 ${hex}`);
  };

  const toggleFitZoom = () => {
    const fit = Math.max(
      0.1,
      Math.min(
        64,
        Math.min((vp.w - 24) / width, (vp.h - 24) / height),
      ),
    );
    const next = Math.abs(zoom - fit) < Math.max(0.02, fit * 0.02) ? 1 : fit;
    setZoom(Math.round(next * 100) / 100);
    setPan({ x: (vp.w - width * next) / 2, y: (vp.h - height * next) / 2 });
  };

  const lastStrokeAt = useRef(0);

  const onDoubleTap = () => {
    if (performance.now() - lastStrokeAt.current > 1500) {
      toggleFitZoom();
      return;
    }
    for (let i = 0; i < 2; i += 1) {
      const snap = undoRef.current[undoRef.current.length - 1];
      if (!snap || snap.kind !== 'layer') break;
      undoRef.current.pop();
      restore(snap);
    }
    syncHist();
    strokeActive.current = false;
    toggleFitZoom();
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
          className={`icon-btn ${gridOn ? 'accent' : ''}`}
          aria-label="网格"
          onClick={() => setSheet('grid')}
        >
          <Grid size={21} />
        </button>
        <button className="icon-btn" aria-label="导出" onClick={() => setSheet('export')}>
          <Share size={21} />
        </button>
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
            gridColor={gridColor}
            gridOn={gridOn}
            gridStep={gridStep}
            pixelPerfect={pixelPerfect}
            alphaLock={active?.alphaLock ?? false}
            hand={hand}
            selection={selection}
            selPath={selPath}
            selTool={selTool}
            selOffset={selOffset}
            bucketTolerance={Math.round(threshold * 2.55)}
            contiguous={contiguous}
            onSelectShape={handleSelectShape}
            onMoveStart={onMoveStart}
            onMoveDelta={onMoveDelta}
            onMoveEnd={onMoveEnd}
            onUndo={() => {
              cancelRecentStroke();
              undo();
            }}
            onRedo={redo}
            onDoubleTap={onDoubleTap}
            onLongPressPick={pickAt}
            onStrokeEnd={onStrokeEnd}
            onZoom={setZoom}
            onPan={setPan}
            onBeginStroke={beginStroke}
            onDirty={handleDirty}
            onViewport={(vw, vh) => {
              if (centered.current) return;
              centered.current = true;
              setVp({ w: vw, h: vh });
              setPan({ x: (vw - width * zoom) / 2, y: (vh - height * zoom) / 2 });
            }}
            onPick={(hex) => {
              setColor(hex);
              setAlpha(255);
              rememberColor(hex);
              showToast(`已取色 ${hex}`);
            }}
          />
          {tool === 'select' && selection && (
            <button className="canvas-clear" onClick={selClear}>
              清除选区
            </button>
          )}
          <button
            className="canvas-help icon-btn"
            aria-label="帮助"
            onClick={() => setSheet('help')}
          >
            <Help size={20} />
          </button>
        </div>
      </div>

      {tool === 'select' ? (
        <div className="sel-bar">
          <div className="mode-wrap">
            <button ref={toolBtnRef} className="sel-mode" onClick={() => setToolMenu((v) => !v)} aria-label="选区工具">
              {selTool === 'rect' && <RectIcon size={17} />}
              {selTool === 'ellipse' && <Ellipse size={17} />}
              {selTool === 'lasso' && <Lasso size={17} />}
              {selTool === 'wand' && <Wand size={17} />}
              {selTool === 'move' && <Move size={17} />}
              <span>{{ rect: '矩形', ellipse: '椭圆', lasso: '套索', wand: '魔棒', move: '移动' }[selTool]}</span>
              <span className={`mode-chev ${toolMenu ? 'open' : ''}`}>›</span>
            </button>
            <DropMenu anchorRef={toolBtnRef} open={toolMenu} onClose={() => setToolMenu(false)}>
                  {([
                    ['rect', '矩形', <RectIcon size={16} key="r" />],
                    ['ellipse', '椭圆', <Ellipse size={16} key="e" />],
                    ['lasso', '套索', <Lasso size={16} key="l" />],
                    ['wand', '魔棒', <Wand size={16} key="w" />],
                    ['move', '移动', <Move size={16} key="m" />],
                  ] as [SelectTool, string, ReactNode][]).map(([id, label, icon]) => (
                    <button
                      key={id}
                      className={selTool === id ? 'on' : ''}
                      onClick={() => {
                        setSelTool(id);
                        setTool('select');
                        setToolMenu(false);
                      }}
                    >
                      <span className="mm-left">{icon}{label}</span>
                      {selTool === id && <Check size={15} />}
                    </button>
                  ))}
                  <div className="mode-divider" />
                  <button
                    onClick={() => {
                      setSelMask(new Uint8Array(width * height).fill(1));
                      setToolMenu(false);
                    }}
                  >
                    全选
                  </button>
                  <button
                    onClick={() => {
                      selInvert();
                      setToolMenu(false);
                    }}
                  >
                    反选
                  </button>
            </DropMenu>
          </div>
          <div className="sel-sep" />
          <div className="mode-wrap">
            <button
              ref={modeBtnRef}
              className="sel-mode"
              onClick={() => setModeMenu((v) => !v)}
              aria-label="选区模式"
            >
              {{ new: '新建', add: '增加', sub: '减去', intersect: '交集' }[selMode]}
              <span className={`mode-chev ${modeMenu ? 'open' : ''}`}>›</span>
            </button>
            <DropMenu anchorRef={modeBtnRef} open={modeMenu} onClose={() => setModeMenu(false)}>
                  {(['new', 'add', 'sub', 'intersect'] as SelMode[]).map((m) => (
                    <button
                      key={m}
                      className={selMode === m ? 'on' : ''}
                      onClick={() => {
                        setSelMode(m);
                        setModeMenu(false);
                      }}
                    >
                      {{ new: '新建', add: '增加', sub: '减去', intersect: '交集' }[m]}
                      {selMode === m && <Check size={15} />}
                    </button>
                  ))}
            </DropMenu>
          </div>
          {floating ? (
            <>
              <div className="sel-sep" />
              <button className="sel-btn" onClick={() => setSelTool('move')}>
                <Move size={22} />
                <span>移动</span>
              </button>
              <button className="sel-btn" onClick={() => flipFloating(true)}>
                <FlipH size={22} />
                <span>水平翻转</span>
              </button>
              <button className="sel-btn" onClick={() => flipFloating(false)}>
                <FlipV size={22} />
                <span>垂直翻转</span>
              </button>
              <div className="sel-sep" />
              <button className="sel-btn" onClick={confirmFloating}>
                <Check size={22} />
                <span>确认</span>
              </button>
              <button className="sel-btn" onClick={cancelFloating}>
                <Close size={22} />
                <span>取消</span>
              </button>
            </>
          ) : selection ? (
            <>
              <div className="sel-sep" />
              <button className="sel-btn" onClick={() => copySelection(false)}>
                <Copy size={22} />
                <span>复制</span>
              </button>
              <button className="sel-btn" onClick={cutToFloating}>
                <Cut size={22} />
                <span>剪切</span>
              </button>
              {clipboard && (
                <button className="sel-btn" onClick={pasteSelection}>
                  <Paste size={22} />
                  <span>粘贴</span>
                </button>
              )}
              <button className="sel-btn" onClick={selFill}>
                <Check size={22} />
                <span>填充</span>
              </button>
              <button className="sel-btn" onClick={selClearPixels}>
                <Close size={22} />
                <span>清除</span>
              </button>
              <button className="sel-btn" onClick={() => selGrow(1)}>
                <Expand size={22} />
                <span>扩展</span>
              </button>
              <button className="sel-btn" onClick={() => selGrow(-1)}>
                <Shrink size={22} />
                <span>收缩</span>
              </button>
              <button className="sel-btn" onClick={() => transformSelection('flipH')}>
                <FlipH size={22} />
                <span>水平翻转</span>
              </button>
              <button className="sel-btn" onClick={() => transformSelection('flipV')}>
                <FlipV size={22} />
                <span>垂直翻转</span>
              </button>
            </>
          ) : null}
        </div>
      ) : (
        <div className={`param-row ${tool === 'shade' ? 'shade' : ''}`}>


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
            <button
              className={`chipbtn ${contiguous ? 'on' : ''}`}
              onClick={() => setContiguous((v) => !v)}
            >
              {contiguous ? '连续' : '全局'}
            </button>
          </>
        )}
        {tool === 'dropper' && <span className="muted">取样 1×1 · 合成结果</span>}
        {tool === 'shade' && (
          <div className="shade-params">
            <div className="shade-line">
              <span className="plabel">尺寸</span>
              <input
                type="range"
                min={1}
                max={50}
                value={brush}
                onChange={(e) => setBrush(Number(e.target.value))}
                aria-label="明度笔刷尺寸"
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
              <span className="pval">px</span>
            </div>
            <div className="shade-line">
              <span className="plabel">明度</span>
              <input
                type="range"
                min={-100}
                max={100}
                value={deltaL}
                onChange={(e) => setDeltaL(Number(e.target.value))}
                aria-label="明度增量"
              />
              <span className="pval">{deltaL}</span>
            </div>
            <div className="shade-line">
              <span className="plabel">饱和</span>
              <input
                type="range"
                min={-100}
                max={100}
                value={deltaS}
                onChange={(e) => setDeltaS(Number(e.target.value))}
                aria-label="饱和度增量"
              />
              <span className="pval">{deltaS}</span>
            </div>
          </div>
        )}
        </div>
      )}

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
            onClick={() => {
              setHand(false);
              setTool(t.id);
            }}
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
          className={`tool ${hand ? 'active' : ''}`}
          onPointerDown={() => {
            window.clearTimeout(handTimer.current);
            handTimer.current = window.setTimeout(() => setHand(true), 520);
          }}
          onPointerUp={() => window.clearTimeout(handTimer.current)}
          onPointerCancel={() => window.clearTimeout(handTimer.current)}
          onClick={() => {
            if (hand) {
              setHand(false);
              return;
            }
            setSelTool('rect');
            setTool('select');
          }}
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
          onRemove={removePalette}
          onClear={clearPalette}
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
          onRename={renameLayer}
          onClearLayer={clearLayer}
          onAlphaLock={toggleAlphaLock}
        />
      )}
      {sheet === 'grid' && (
        <GridSheet
          color={gridColor}
          on={gridOn}
          step={gridStep}
          onColor={setGridColor}
          onStep={setGridStep}
          onToggle={() => setGridOn((v) => !v)}
        />
      )}
      {sheet === 'export' && project && (
        <ExportSheet
          lastPath={lastExport}
          onExport={async (scale) => {
            try {
              const path = await saveProjectPng(project, scale);
              setLastExport(path);
              showToast(`已导出：${path}`);
            } catch {
              showToast('导出失败');
            }
          }}
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
      {sheet === 'effects' && (
        <EffectsSheet
          onNoise={applyNoise}
          hasSelection={!!selection}
          onAdjustHSL={adjustSelectionHSL}
        />
      )}
      {sheet === 'help' && <HelpSheet />}
    </div>
  );
}
