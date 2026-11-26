import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { converter, formatHex } from 'culori';

const SIZE = 220;
const CX = SIZE / 2;
const CY = SIZE / 2;
const OUTER = 105;
const INNER = 79;
const SQ = 104;
const SQ0 = CX - SQ / 2;

const hsv = converter('hsv');

function hueToHex(h: number, s: number, v: number): string {
  return (formatHex({ mode: 'hsv', h, s, v }) ?? '#000000').toUpperCase();
}

interface Props {
  color: string;
  onChange: (hex: string) => void;
}

export function ColorWheel({ color, onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ringRef = useRef<HTMLCanvasElement | null>(null);
  const dragging = useRef(false);

  const current = hsv(color) ?? { h: 0, s: 0, v: 0 };
  const hue = current.h ?? 0;
  const sat = current.s ?? 0;
  const val = current.v ?? 0;

  // 色环只画一次，后续每帧复用
  useEffect(() => {
    const ring = document.createElement('canvas');
    ring.width = SIZE;
    ring.height = SIZE;
    const ctx = ring.getContext('2d');
    if (!ctx) return;
    const r = (OUTER + INNER) / 2;
    const thick = OUTER - INNER;
    for (let i = 0; i < 360; i += 1) {
      const a0 = ((i - 0.7) * Math.PI) / 180;
      const a1 = ((i + 0.7) * Math.PI) / 180;
      ctx.beginPath();
      ctx.arc(CX, CY, r, a0, a1);
      ctx.strokeStyle = `hsl(${i}, 100%, 50%)`;
      ctx.lineWidth = thick;
      ctx.stroke();
    }
    ringRef.current = ring;
  }, []);

  const draw = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    if (cv.width !== SIZE * dpr) {
      cv.width = SIZE * dpr;
      cv.height = SIZE * dpr;
    }
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, SIZE, SIZE);

    if (ringRef.current) ctx.drawImage(ringRef.current, 0, 0);

    // 中心 SV 方块
    const base = ctx.createLinearGradient(SQ0, 0, SQ0 + SQ, 0);
    base.addColorStop(0, '#ffffff');
    base.addColorStop(1, `hsl(${hue}, 100%, 50%)`);
    ctx.fillStyle = base;
    ctx.fillRect(SQ0, SQ0, SQ, SQ);
    const dark = ctx.createLinearGradient(0, SQ0, 0, SQ0 + SQ);
    dark.addColorStop(0, 'rgba(0,0,0,0)');
    dark.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = dark;
    ctx.fillRect(SQ0, SQ0, SQ, SQ);

    // 色相把手
    const rad = (hue * Math.PI) / 180;
    const kx = CX + Math.cos(rad) * ((OUTER + INNER) / 2);
    const ky = CY + Math.sin(rad) * ((OUTER + INNER) / 2);
    ctx.beginPath();
    ctx.arc(kx, ky, 9, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    // SV 光标
    const sx = SQ0 + sat * SQ;
    const sy = SQ0 + (1 - val) * SQ;
    ctx.beginPath();
    ctx.arc(sx, sy, 8, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  }, [color, hue, sat, val]);

  useEffect(() => {
    draw();
  }, [draw]);

  const apply = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const cv = canvasRef.current;
    if (!cv) return;
    const rect = cv.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * SIZE;
    const y = ((e.clientY - rect.top) / rect.height) * SIZE;
    const dx = x - CX;
    const dy = y - CY;
    const dist = Math.hypot(dx, dy);
    // 方块四周留 10px 缓冲，避免贴边取色时误触色相环
    const pad = 10;
    const inSquarePad =
      x >= SQ0 - pad && x <= SQ0 + SQ + pad && y >= SQ0 - pad && y <= SQ0 + SQ + pad;

    if (!inSquarePad && dist > INNER) {
      const deg = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
      onChange(hueToHex(deg, sat, val));
      return;
    }
    const s = Math.min(1, Math.max(0, (x - SQ0) / SQ));
    const v = Math.min(1, Math.max(0, 1 - (y - SQ0) / SQ));
    onChange(hueToHex(hue, s, v));
  };

  return (
    <canvas
      ref={canvasRef}
      style={{ width: SIZE, height: SIZE, touchAction: 'none', display: 'block', margin: '0 auto' }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        dragging.current = true;
        apply(e);
      }}
      onPointerMove={(e) => {
        if (!dragging.current) return;
        apply(e);
      }}
      onPointerUp={() => {
        dragging.current = false;
      }}
      onPointerCancel={() => {
        dragging.current = false;
      }}
      aria-label="调色环"
    />
  );
}
