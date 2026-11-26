import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  adjustPixel,
  getPixel,
  parseHex,
  setPixel,
  strokeLine,
  toHex,
  type RGBA,
} from '../core/pixels';
import type { Rect } from '../core/layers';
import { boundsOf, magicWand, pointInSelection, type Selection } from '../core/selection';

export type SelectShape =
  | { kind: 'rect'; rect: Rect }
  | { kind: 'ellipse'; rect: Rect }
  | { kind: 'lasso'; points: { x: number; y: number }[] }
  | { kind: 'wand'; x: number; y: number };

export type SelectTool = 'rect' | 'ellipse' | 'lasso' | 'wand' | 'move';

export type ToolId = 'pencil' | 'eraser' | 'bucket' | 'dropper' | 'shade' | 'select';

interface Props {
  width: number;
  height: number;
  source: HTMLCanvasElement;
  version: number;
  activePixels: Uint8ClampedArray | null;
  tool: ToolId;
  color: string;
  alpha: number;
  brush: number;
  zoom: number;
  pan: { x: number; y: number };
  shadeL: number;
  shadeS: number;
  onZoom: (z: number) => void;
  onPan: (p: { x: number; y: number }) => void;
  onBeginStroke: () => void;
  onDirty: (rect: Rect) => void;
  onPick: (hex: string) => void;
  onViewport?: (w: number, h: number) => void;
  gridColor: string;
  gridOn: boolean;
  gridStep: number;
  pixelPerfect: boolean;
  alphaLock: boolean;
  hand: boolean;
  selection: Selection | null;
  selPath: Path2D | null;
  selTool: SelectTool;
  selOffset: { x: number; y: number };
  bucketTolerance: number;
  contiguous: boolean;
  onSelectShape: (shape: SelectShape) => void;
  onMoveStart: (x: number, y: number) => void;
  onMoveDelta: (dx: number, dy: number) => void;
  onMoveEnd: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onDoubleTap: () => void;
  onLongPressPick: (x: number, y: number) => void;
  onStrokeEnd: () => void;
}

let checkerPattern: CanvasPattern | null = null;
function getChecker(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  if (checkerPattern) return checkerPattern;
  const tile = document.createElement('canvas');
  tile.width = 16;
  tile.height = 16;
  const tctx = tile.getContext('2d');
  if (!tctx) return null;
  tctx.fillStyle = '#232326';
  tctx.fillRect(0, 0, 16, 16);
  tctx.fillStyle = '#2b2b30';
  tctx.fillRect(0, 0, 8, 8);
  tctx.fillRect(8, 8, 8, 8);
  checkerPattern = ctx.createPattern(tile, 'repeat');
  return checkerPattern;
}

function clampRect(x: number, y: number, w: number, h: number, W: number, H: number): Rect {
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const x1 = Math.min(W, x + w);
  const y1 = Math.min(H, y + h);
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

export function CanvasStage({
  width,
  height,
  source,
  version,
  activePixels,
  tool,
  color,
  alpha,
  brush,
  zoom,
  pan,
  shadeL,
  shadeS,
  onZoom,
  onPan,
  onBeginStroke,
  onDirty,
  onPick,
  onViewport,
  gridColor,
  gridOn,
  gridStep,
  pixelPerfect,
  alphaLock,
  hand,
  selection,
  selPath,
  selTool,
  selOffset,
  bucketTolerance,
  contiguous,
  onSelectShape,
  onMoveStart,
  onMoveDelta,
  onMoveEnd,
  onUndo,
  onRedo,
  onDoubleTap,
  onLongPressPick,
  onStrokeEnd,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const [ants, setAnts] = useState(0);
  const [loupe, setLoupe] = useState<{ x: number; y: number } | null>(null);
  const loupeRef = useRef<HTMLCanvasElement | null>(null);
  const [shape, setShape] = useState<{ start: { x: number; y: number }; cur: { x: number; y: number }; points: { x: number; y: number }[] } | null>(null);
  const moving = useRef<{ x: number; y: number } | null>(null);
  const gesture = useRef({
    max: 0,
    moved: false,
    longFired: false,
    longTimer: 0,
    downAt: 0,
    startX: 0,
    startY: 0,
    lastTap: 0,
    lastX: 0,
    lastY: 0,
  });
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const visited = useRef<Uint8Array | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{
    dist: number;
    zoom: number;
    cx: number;
    cy: number;
    px: number;
    py: number;
  } | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setViewport({ w: r.width, h: r.height });
      onViewport?.(r.width, r.height);
    });
    ro.observe(el);
    const r = el.getBoundingClientRect();
    setViewport({ w: r.width, h: r.height });
    onViewport?.(r.width, r.height);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const draw = useCallback(() => {
    const cv = canvasRef.current;
    const vw = viewport.w;
    const vh = viewport.h;
    if (!cv || vw <= 0 || vh <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    const pw = Math.round(vw * dpr);
    const ph = Math.round(vh * dpr);
    if (cv.width !== pw || cv.height !== ph) {
      cv.width = pw;
      cv.height = ph;
    }
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, vw, vh);

    const iw = width * zoom;
    const ih = height * zoom;

    // 图片区域的透明棋盘格（屏幕空间）
    ctx.save();
    ctx.beginPath();
    ctx.rect(pan.x, pan.y, iw, ih);
    ctx.clip();
    const pattern = getChecker(ctx);
    if (pattern) {
      ctx.fillStyle = pattern;
      ctx.fillRect(pan.x, pan.y, iw, ih);
    }
    ctx.restore();

    // 只画视口内的源区域
    const sx = Math.max(0, -pan.x / zoom);
    const sy = Math.max(0, -pan.y / zoom);
    const sw = Math.min(width - sx, vw / zoom);
    const sh = Math.min(height - sy, vh / zoom);
    if (sw > 0 && sh > 0) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        source,
        sx,
        sy,
        sw,
        sh,
        pan.x + sx * zoom,
        pan.y + sy * zoom,
        sw * zoom,
        sh * zoom,
      );
    }

    // 边框
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1;
    ctx.strokeRect(pan.x - 0.5, pan.y - 0.5, iw + 1, ih + 1);

    // 选区预览
    if (shape) {
      ctx.save();
      ctx.beginPath();
      if (selTool === 'rect') {
        const x = Math.min(shape.start.x, shape.cur.x) * zoom + pan.x;
        const y = Math.min(shape.start.y, shape.cur.y) * zoom + pan.y;
        const rw = Math.abs(shape.cur.x - shape.start.x) * zoom;
        const rh = Math.abs(shape.cur.y - shape.start.y) * zoom;
        ctx.rect(x, y, rw, rh);
      } else if (selTool === 'ellipse') {
        const x = Math.min(shape.start.x, shape.cur.x) * zoom + pan.x;
        const y = Math.min(shape.start.y, shape.cur.y) * zoom + pan.y;
        const rw = Math.abs(shape.cur.x - shape.start.x) * zoom;
        const rh = Math.abs(shape.cur.y - shape.start.y) * zoom;
        ctx.ellipse(x + rw / 2, y + rh / 2, rw / 2, rh / 2, 0, 0, Math.PI * 2);
      } else {
        shape.points.forEach((pt, i) => {
          const px = pt.x * zoom + pan.x;
          const py = pt.y * zoom + pan.y;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
      }
      ctx.fillStyle = 'rgba(157,255,235,0.12)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.restore();
    }

    // 蚂蚁线
    if (selPath) {
      ctx.save();
      ctx.translate(pan.x, pan.y);
      ctx.scale(zoom, zoom);
      ctx.translate(selOffset.x, selOffset.y);
      ctx.lineWidth = 1 / zoom;
      ctx.setLineDash([4 / zoom, 4 / zoom]);
      ctx.strokeStyle = '#ffffff';
      ctx.lineDashOffset = -ants / zoom;
      ctx.stroke(selPath);
      ctx.strokeStyle = '#000000';
      ctx.lineDashOffset = (-ants + 4) / zoom;
      ctx.stroke(selPath);
      ctx.restore();
    }

    // 网格（只画可见范围）
    if ((zoom >= 8 || gridOn) && iw <= 200000 && ih <= 200000) {
      const step = gridOn ? Math.max(1, gridStep) : 1;
      const x0 = Math.max(0, Math.floor(-pan.x / zoom / step) * step);
      const x1 = Math.min(width, Math.ceil((vw - pan.x) / zoom));
      const y0 = Math.max(0, Math.floor(-pan.y / zoom / step) * step);
      const y1 = Math.min(height, Math.ceil((vh - pan.y) / zoom));
      ctx.fillStyle = gridOn ? '#9DFFEB' : gridColor;
      ctx.globalAlpha = gridOn ? 0.55 : 0.2;
      const lw = gridOn ? 1.5 : 1;
      for (let x = x0; x <= x1; x += step) {
        const px = Math.round(pan.x + x * zoom);
        ctx.fillRect(px, Math.max(0, pan.y), lw, Math.min(vh, ih));
      }
      for (let y = y0; y <= y1; y += step) {
        const py = Math.round(pan.y + y * zoom);
        ctx.fillRect(Math.max(0, pan.x), py, Math.min(vw, iw), lw);
      }
      ctx.globalAlpha = 1;
    }
  }, [source, width, height, zoom, pan, viewport, selection, selPath, selTool, selOffset, shape, ants, gridColor, gridOn, gridStep]);

  useEffect(() => {
    draw();
  }, [draw, version]);

  useEffect(() => {
    if (!selPath) return;
    const timer = window.setInterval(() => setAnts((a) => a + 2), 120);
    return () => window.clearInterval(timer);
  }, [selPath]);

  const toTexel = (clientX: number, clientY: number) => {
    const el = wrapRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return {
      x: Math.floor((clientX - r.left - pan.x) / zoom),
      y: Math.floor((clientY - r.top - pan.y) / zoom),
    };
  };

  const paintAt = (x: number, y: number) => {
    if (!activePixels) return;
    const rgba: RGBA =
      tool === 'eraser' ? { r: 0, g: 0, b: 0, a: 0 } : { ...parseHex(color), a: alpha };
    const from = last.current ?? { x, y };
    strokeLine(
      activePixels,
      width,
      height,
      from.x,
      from.y,
      x,
      y,
      brush,
      rgba,
      selection?.mask,
      pixelPerfect && brush === 1,
      alphaLock,
    );
    const half = Math.floor(brush / 2);
    onDirty(
      clampRect(
        Math.min(from.x, x) - half,
        Math.min(from.y, y) - half,
        Math.abs(x - from.x) + brush,
        Math.abs(y - from.y) + brush,
        width,
        height,
      ),
    );
    last.current = { x, y };
    draw();
  };

  const shadeAt = (x: number, y: number) => {
    if (!activePixels) return;
    if (!visited.current) visited.current = new Uint8Array(width * height);
    const seen = visited.current;
    const half = Math.floor(brush / 2);
    for (let dy = 0; dy < brush; dy += 1) {
      for (let dx = 0; dx < brush; dx += 1) {
        const px = x + dx - half;
        const py = y + dy - half;
        if (px < 0 || py < 0 || px >= width || py >= height) continue;
        const idx = py * width + px;
        if (seen[idx]) continue;
        seen[idx] = 1;
        if (selection && !selection.mask[idx]) continue;
        if (alphaLock && activePixels[idx * 4 + 3] === 0) continue;
        const src = getPixel(activePixels, width, height, px, py);
        if (src.a === 0) continue;
        setPixel(activePixels, width, height, px, py, adjustPixel(src, shadeL, shadeS));
      }
    }
    onDirty(clampRect(x - half, y - half, brush, brush, width, height));
    draw();
  };

  const floodFill = (sx: number, sy: number) => {
    if (!activePixels) return;
    const region = magicWand(activePixels, width, height, sx, sy, {
      tolerance: bucketTolerance,
      contiguous,
      sample: 'layer',
    });
    const fill = { ...parseHex(color), a: alpha };
    const b = boundsOf(region, width, height);
    if (!b.w || !b.h) return;
    for (let y = b.y; y < b.y + b.h; y += 1) {
      for (let x = b.x; x < b.x + b.w; x += 1) {
        const idx = y * width + x;
        if (!region[idx]) continue;
        if (selection && !selection.mask[idx]) continue;
        if (alphaLock && activePixels[idx * 4 + 3] === 0) continue;
        setPixel(activePixels, width, height, x, y, fill);
      }
    }
    onDirty(b);
    draw();
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (pointers.current.size === 1) {
      g.max = 1;
      g.moved = false;
      g.longFired = false;
      g.downAt = performance.now();
      g.startX = e.clientX;
      g.startY = e.clientY;
      window.clearTimeout(g.longTimer);
      g.longTimer = window.setTimeout(() => {
        if (g.moved || pointers.current.size !== 1) return;
        g.longFired = true;
        drawing.current = false;
        const r = wrapRef.current?.getBoundingClientRect();
        if (r) setLoupe({ x: e.clientX - r.left, y: e.clientY - r.top });
      }, 380);
    } else {
      g.max = Math.max(g.max, pointers.current.size);
      window.clearTimeout(g.longTimer);
    }

    if (pointers.current.size === 1 && hand) {
      gesture.current.startX = e.clientX;
      gesture.current.startY = e.clientY;
      return;
    }
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        zoom,
        cx: (a.x + b.x) / 2,
        cy: (a.y + b.y) / 2,
        px: pan.x,
        py: pan.y,
      };
      drawing.current = false;
      last.current = null;
      return;
    }
    if (pointers.current.size > 2) return;

    const { x, y } = toTexel(e.clientX, e.clientY);
    if (x < 0 || y < 0 || x >= width || y >= height) return;

    if (tool === 'dropper') {
      const sctx = source.getContext('2d');
      if (!sctx) return;
      const d = sctx.getImageData(x, y, 1, 1).data;
      onPick(toHex({ r: d[0], g: d[1], b: d[2], a: d[3] }));
      return;
    }
    if (tool === 'bucket') {
      onBeginStroke();
      floodFill(x, y);
      return;
    }
    if (tool === 'select') {
      if (selTool === 'wand') {
        onSelectShape({ kind: 'wand', x, y });
        return;
      }
      if (selTool === 'move') {
        if (selection && pointInSelection(selection, x, y, width)) {
          moving.current = { x, y };
          onMoveStart(x, y);
        }
        return;
      }
      setShape({ start: { x, y }, cur: { x, y }, points: [{ x, y }] });
      return;
    }
    if (!activePixels) return;

    onBeginStroke();
    drawing.current = true;
    last.current = null;
    visited.current = new Uint8Array(width * height);
    if (tool === 'shade') {
      shadeAt(x, y);
      return;
    }
    paintAt(x, y);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    if (hand && pointers.current.size === 1) {
      const g = gesture.current;
      onPan({ x: pan.x + (e.clientX - g.startX), y: pan.y + (e.clientY - g.startY) });
      g.startX = e.clientX;
      g.startY = e.clientY;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      return;
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (g.longFired) {
      const r = wrapRef.current?.getBoundingClientRect();
      if (r) setLoupe({ x: e.clientX - r.left, y: e.clientY - r.top });
      return;
    }
    if (Math.hypot(e.clientX - g.startX, e.clientY - g.startY) > 6) {
      g.moved = true;
      window.clearTimeout(g.longTimer);
    }

    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      const next = Math.min(64, Math.max(0.1, (pinch.current.zoom * dist) / pinch.current.dist));
      const zoomed = Math.round(next * 100) / 100;
      // 缩放锚点固定在视口正中心；双指整体移动仍然平移
      const k = zoomed / pinch.current.zoom;
      const vcx = viewport.w / 2;
      const vcy = viewport.h / 2;
      onZoom(zoomed);
      onPan({
        x: vcx - (vcx - pinch.current.px) * k + (cx - pinch.current.cx),
        y: vcy - (vcy - pinch.current.py) * k + (cy - pinch.current.cy),
      });
      return;
    }

    if (tool === 'select') {
      const tx = Math.max(0, Math.min(width - 1, toTexel(e.clientX, e.clientY).x));
      const ty = Math.max(0, Math.min(height - 1, toTexel(e.clientX, e.clientY).y));
      if (moving.current) {
        onMoveDelta(tx - moving.current.x, ty - moving.current.y);
        return;
      }
      if (shape) {
        const points =
          selTool === 'lasso'
            ? [...shape.points, { x: tx, y: ty }].slice(-2000)
            : shape.points;
        setShape({ ...shape, cur: { x: tx, y: ty }, points });
      }
      return;
    }

    if (!drawing.current) return;
    const { x, y } = toTexel(e.clientX, e.clientY);
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    if (tool === 'shade') shadeAt(x, y);
    else paintAt(x, y);
  };

  const endPointer = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) {
      window.clearTimeout(g.longTimer);
      if (g.longFired) {
        const t = toTexel(e.clientX, e.clientY);
        if (t.x >= 0 && t.y >= 0 && t.x < width && t.y < height) onLongPressPick(t.x, t.y);
        setLoupe(null);
        g.longFired = false;
        onStrokeEnd();
        return;
      }
      const dur = performance.now() - g.downAt;
      if (g.max >= 2 && !g.moved && dur < 320) {
        if (g.max === 2) onUndo();
        else onRedo();
      } else if (g.max === 1 && !g.moved && !g.longFired && dur < 260) {
        const now = performance.now();
        const far = Math.hypot(e.clientX - g.lastX, e.clientY - g.lastY);
        if (now - g.lastTap < 340 && far < 28) {
          g.lastTap = 0;
          onDoubleTap();
        } else {
          g.lastTap = now;
          g.lastX = e.clientX;
          g.lastY = e.clientY;
        }
      }
    }
    if (pointers.current.size < 2) pinch.current = null;
    if (tool === 'select') {
      if (moving.current) {
        moving.current = null;
        onMoveEnd();
      }
      if (shape) {
        const x = Math.min(shape.start.x, shape.cur.x);
        const y = Math.min(shape.start.y, shape.cur.y);
        const rw = Math.abs(shape.cur.x - shape.start.x) + 1;
        const rh = Math.abs(shape.cur.y - shape.start.y) + 1;
        if (selTool === 'rect' && rw > 1 && rh > 1) {
          onSelectShape({ kind: 'rect', rect: { x, y, w: rw, h: rh } });
        } else if (selTool === 'ellipse' && rw > 1 && rh > 1) {
          onSelectShape({ kind: 'ellipse', rect: { x, y, w: rw, h: rh } });
        } else if (selTool === 'lasso' && shape.points.length > 2) {
          onSelectShape({ kind: 'lasso', points: shape.points });
        }
        setShape(null);
      }
    }
    if (drawing.current) {
      drawing.current = false;
      last.current = null;
      onStrokeEnd();
    } else if (g.longFired) {
      g.longFired = false;
      onStrokeEnd();
    }
  };

  useEffect(() => {
    if (!loupe) return;
    const cv = loupeRef.current;
    if (!cv) return;
    const size = 96;
    cv.width = size * 2;
    cv.height = size * 2;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return;
    const tx = Math.floor((loupe.x - pan.x) / zoom);
    const ty = Math.floor((loupe.y - pan.y) / zoom);
    const half = 6;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#111114';
    ctx.fillRect(0, 0, size * 2, size * 2);
    ctx.drawImage(
      source,
      tx - half,
      ty - half,
      half * 2,
      half * 2,
      0,
      0,
      size * 2,
      size * 2,
    );
    ctx.strokeStyle = 'rgba(157,255,235,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(size, size - 14);
    ctx.lineTo(size, size + 14);
    ctx.moveTo(size - 14, size);
    ctx.lineTo(size + 14, size);
    ctx.stroke();
  }, [loupe, source, pan, zoom]);

  return (
    <div
      ref={wrapRef}
      className="viewport"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      {loupe && (
        <canvas
          ref={loupeRef}
          className="loupe"
          style={{
            left: Math.max(4, Math.min(viewport.w - 100, loupe.x - 48)),
            top: Math.max(4, loupe.y - 120),
          }}
        />
      )}
    </div>
  );
}
