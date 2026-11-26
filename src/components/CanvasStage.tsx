import {
  useCallback,
  useEffect,
  useRef,
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

export type ToolId = 'pencil' | 'eraser' | 'bucket' | 'dropper' | 'shade' | 'select';

interface Props {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
  tool: ToolId;
  color: string;
  alpha: number;
  brush: number;
  zoom: number;
  pan: { x: number; y: number };
  version: number;
  shadeL: number;
  shadeS: number;
  onZoom: (z: number) => void;
  onPan: (p: { x: number; y: number }) => void;
  onBeginStroke: () => void;
  onDirty: () => void;
  onPick: (hex: string) => void;
}

const toHsl = converter('hsl');
const toRgb = converter('rgb');

export function CanvasStage({
  width,
  height,
  pixels,
  tool,
  color,
  alpha,
  brush,
  zoom,
  pan,
  version,
  shadeL,
  shadeS,
  onZoom,
  onPan,
  onBeginStroke,
  onDirty,
  onPick,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offRef = useRef<HTMLCanvasElement | null>(null);
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

  const draw = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const w = Math.round(width * zoom);
    const h = Math.round(height * zoom);
    if (cv.width !== w || cv.height !== h) {
      cv.width = w;
      cv.height = h;
    }
    let off = offRef.current;
    if (!off) {
      off = document.createElement('canvas');
      offRef.current = off;
    }
    if (off.width !== width || off.height !== height) {
      off.width = width;
      off.height = height;
    }
    const octx = off.getContext('2d');
    const ctx = cv.getContext('2d');
    if (!octx || !ctx) return;
    octx.clearRect(0, 0, width, height);
    octx.putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(off, 0, 0, w, h);

    if (zoom >= 8 && w <= 2048 && h <= 2048) {
      ctx.fillStyle = 'rgba(0,0,0,0.10)';
      for (let i = 1; i < width; i += 1) {
        ctx.fillRect(Math.round(i * zoom), 0, 1, h);
      }
      for (let i = 1; i < height; i += 1) {
        ctx.fillRect(0, Math.round(i * zoom), w, 1);
      }
    }
  }, [pixels, width, height, zoom]);

  useEffect(() => {
    draw();
  }, [draw, version]);

  const toTexel = (clientX: number, clientY: number) => {
    const cv = canvasRef.current;
    if (!cv) return { x: 0, y: 0 };
    const r = cv.getBoundingClientRect();
    return {
      x: Math.floor(((clientX - r.left) / r.width) * width),
      y: Math.floor(((clientY - r.top) / r.height) * height),
    };
  };

  const paintAt = (x: number, y: number) => {
    const rgba: RGBA =
      tool === 'eraser' ? { r: 0, g: 0, b: 0, a: 0 } : { ...parseHex(color), a: alpha };
    const from = last.current ?? { x, y };
    strokeLine(
      pixels,
      width,
      height,
      from.x,
      from.y,
      x,
      y,
      brush,
      rgba,
    );
    last.current = { x, y };
    draw();
    onDirty();
  };

  /** 明度/饱和度笔刷：每个像素在一笔里只调整一次 */
  const shadeAt = (x: number, y: number) => {
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
        const src = getPixel(pixels, width, height, px, py);
        if (src.a === 0) continue;
        const hsl = toHsl({ mode: 'rgb', r: src.r / 255, g: src.g / 255, b: src.b / 255 });
        if (!hsl) continue;
        let l = (hsl.l ?? 0) + shadeL / 100;
        let s = (hsl.s ?? 0) * (1 + shadeS / 100);
        l = Math.min(1, Math.max(0, l));
        s = Math.min(1, Math.max(0, s));
        const rgb = toRgb({ mode: 'hsl', h: hsl.h ?? 0, s, l });
        if (!rgb) continue;
        setPixel(pixels, width, height, px, py, {
          r: Math.round((rgb.r ?? 0) * 255),
          g: Math.round((rgb.g ?? 0) * 255),
          b: Math.round((rgb.b ?? 0) * 255),
          a: src.a,
        });
      }
    }
    draw();
    onDirty();
  };

  const floodFill = (sx: number, sy: number) => {
    const target = getPixel(pixels, width, height, sx, sy);
    const fill = parseHex(color);
    if (
      target.r === fill.r &&
      target.g === fill.g &&
      target.b === fill.b &&
      target.a === fill.a
    )
      return;
    const stack: [number, number][] = [[sx, sy]];
    const seen = new Uint8Array(width * height);
    while (stack.length) {
      const [x, y] = stack.pop() as [number, number];
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const idx = y * width + x;
      if (seen[idx]) continue;
      seen[idx] = 1;
      const p = getPixel(pixels, width, height, x, y);
      if (p.r !== target.r || p.g !== target.g || p.b !== target.b || p.a !== target.a)
        continue;
      setPixel(pixels, width, height, x, y, { ...fill, a: alpha });
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    draw();
    onDirty();
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
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
      onPick(toHex(getPixel(pixels, width, height, x, y)));
      return;
    }
    if (tool === 'bucket') {
      onBeginStroke();
      floodFill(x, y);
      return;
    }
    if (tool === 'select') return;

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

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      const next = Math.min(64, Math.max(0.1, (pinch.current.zoom * dist) / pinch.current.dist));
      onZoom(Math.round(next * 100) / 100);
      onPan({
        x: pinch.current.px + (cx - pinch.current.cx),
        y: pinch.current.py + (cy - pinch.current.cy),
      });
      return;
    }

    if (!drawing.current) return;
    const { x, y } = toTexel(e.clientX, e.clientY);
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    if (tool === 'shade') {
      shadeAt(x, y);
      return;
    }
    paintAt(x, y);
  };

  const endPointer = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (drawing.current) {
      drawing.current = false;
      last.current = null;
    }
  };

  return (
    <div
      className="stage"
      style={{
        transform: `translate(${pan.x}px, ${pan.y}px)`,
        width: width * zoom,
        height: height * zoom,
      }}
    >
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        style={{ width: '100%', height: '100%', touchAction: 'none' }}
      />
    </div>
  );
}
