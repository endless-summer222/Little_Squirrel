import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { converter } from 'culori';
import {
  getPixel,
  parseHex,
  setPixel,
  strokeLine,
  toHex,
  type RGBA,
} from '../core/pixels';
import type { Rect } from '../core/layers';

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
}

const toHsl = converter('hsl');
const toRgb = converter('rgb');

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
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
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

    // 网格（只画可见范围）
    if (zoom >= 8 && iw <= 200000 && ih <= 200000) {
      const x0 = Math.max(0, Math.floor(-pan.x / zoom));
      const x1 = Math.min(width, Math.ceil((vw - pan.x) / zoom));
      const y0 = Math.max(0, Math.floor(-pan.y / zoom));
      const y1 = Math.min(height, Math.ceil((vh - pan.y) / zoom));
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      for (let x = x0; x <= x1; x += 1) {
        const px = Math.round(pan.x + x * zoom);
        ctx.fillRect(px, Math.max(0, pan.y), 1, Math.min(vh, ih));
      }
      for (let y = y0; y <= y1; y += 1) {
        const py = Math.round(pan.y + y * zoom);
        ctx.fillRect(Math.max(0, pan.x), py, Math.min(vw, iw), 1);
      }
    }
  }, [source, width, height, zoom, pan, viewport]);

  useEffect(() => {
    draw();
  }, [draw, version]);

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
    strokeLine(activePixels, width, height, from.x, from.y, x, y, brush, rgba);
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
        const src = getPixel(activePixels, width, height, px, py);
        if (src.a === 0) continue;
        const hsl = toHsl({ mode: 'rgb', r: src.r / 255, g: src.g / 255, b: src.b / 255 });
        if (!hsl) continue;
        const l = Math.min(1, Math.max(0, (hsl.l ?? 0) + shadeL / 100));
        const s = Math.min(1, Math.max(0, (hsl.s ?? 0) * (1 + shadeS / 100)));
        const rgb = toRgb({ mode: 'hsl', h: hsl.h ?? 0, s, l });
        if (!rgb) continue;
        setPixel(activePixels, width, height, px, py, {
          r: Math.round((rgb.r ?? 0) * 255),
          g: Math.round((rgb.g ?? 0) * 255),
          b: Math.round((rgb.b ?? 0) * 255),
          a: src.a,
        });
      }
    }
    onDirty(clampRect(x - half, y - half, brush, brush, width, height));
    draw();
  };

  const floodFill = (sx: number, sy: number) => {
    if (!activePixels) return;
    const target = getPixel(activePixels, width, height, sx, sy);
    const fill = parseHex(color);
    if (target.r === fill.r && target.g === fill.g && target.b === fill.b && target.a === alpha)
      return;
    const stack: [number, number][] = [[sx, sy]];
    const seen = new Uint8Array(width * height);
    let minX = sx;
    let minY = sy;
    let maxX = sx;
    let maxY = sy;
    while (stack.length) {
      const [x, y] = stack.pop() as [number, number];
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const idx = y * width + x;
      if (seen[idx]) continue;
      seen[idx] = 1;
      const p = getPixel(activePixels, width, height, x, y);
      if (p.r !== target.r || p.g !== target.g || p.b !== target.b || p.a !== target.a) continue;
      setPixel(activePixels, width, height, x, y, { ...fill, a: alpha });
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    onDirty(clampRect(minX, minY, maxX - minX + 1, maxY - minY + 1, width, height));
    draw();
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

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
    if (tool === 'select' || !activePixels) return;

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
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

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

    if (!drawing.current) return;
    const { x, y } = toTexel(e.clientX, e.clientY);
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    if (tool === 'shade') shadeAt(x, y);
    else paintAt(x, y);
  };

  const endPointer = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (drawing.current) {
      drawing.current = false;
      last.current = null;
    }
  };

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
    </div>
  );
}
