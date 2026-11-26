export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function parseHex(hex: string): RGBA {
  const h = hex.replace('#', '').trim();
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  const n = Number.parseInt(full.slice(0, 6) || '000000', 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 255 };
}

export function toHex(c: RGBA): string {
  const p = (v: number) => v.toString(16).padStart(2, '0');
  return `#${p(c.r)}${p(c.g)}${p(c.b)}`.toUpperCase();
}

export function createBuffer(size: number): Uint8ClampedArray {
  return new Uint8ClampedArray(size * size * 4);
}

export function setPixel(
  buf: Uint8ClampedArray,
  w: number,
  h: number,
  x: number,
  y: number,
  c: RGBA,
): void {
  if (x < 0 || y < 0 || x >= w || y >= h) return;
  const i = (y * w + x) * 4;
  buf[i] = c.r;
  buf[i + 1] = c.g;
  buf[i + 2] = c.b;
  buf[i + 3] = c.a;
}

export function getPixel(
  buf: Uint8ClampedArray,
  w: number,
  _h: number,
  x: number,
  y: number,
): RGBA {
  const i = (y * w + x) * 4;
  return { r: buf[i], g: buf[i + 1], b: buf[i + 2], a: buf[i + 3] };
}

/** 方形笔刷落点 */
export function stamp(
  buf: Uint8ClampedArray,
  w: number,
  h: number,
  x: number,
  y: number,
  size: number,
  c: RGBA,
  mask?: Uint8Array | null,
  alphaLock = false,
): void {
  const half = Math.floor(size / 2);
  for (let dy = 0; dy < size; dy += 1) {
    for (let dx = 0; dx < size; dx += 1) {
      const px = x + dx - half;
      const py = y + dy - half;
      if (px < 0 || py < 0 || px >= w || py >= h) continue;
      if (mask && !mask[py * w + px]) continue;
      if (alphaLock && buf[(py * w + px) * 4 + 3] === 0) continue;
      setPixel(buf, w, h, px, py, c);
    }
  }
}

/** Bresenham 连线，避免快速滑动断笔 */
export function strokeLine(
  buf: Uint8ClampedArray,
  w: number,
  h: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  size: number,
  c: RGBA,
  mask?: Uint8Array | null,
  skipStart = false,
  alphaLock = false,
): void {
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;

  let first = true;
  for (;;) {
    if (!(first && skipStart && !(x === x1 && y === y1))) {
      stamp(buf, w, h, x, y, size, c, mask, alphaLock);
    }
    first = false;
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

export function cloneBuffer(buf: Uint8ClampedArray): Uint8ClampedArray {
  return new Uint8ClampedArray(buf);
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const MINT = ['#DCE8E4', '#EAF2EF', '#CFD9D6', '#F3F7F5', '#C6D2CF', '#E6EFEC'];
const ACCENT = ['#E9E4F4', '#F6F4FA', '#D8D3E6'];

/**
 * 生成一张 32×32 的“皮肤/UV”示例贴图：
 * 左右两块浅薄荷色色块 + 中间透明竖条 + 底部深色块，接近界面参考图的观感。
 */
export function createDemoTexture(size: number, seedText: string): Uint8ClampedArray {
  const buf = createBuffer(size);
  const rand = mulberry32(hashSeed(seedText));
  const unit = Math.max(2, Math.round(size / 8));

  const blocks = (x0: number, x1: number) => {
    for (let y = unit; y < size - unit * 1.5; y += unit) {
      for (let x = x0; x < x1; x += unit) {
        const roll = rand();
        const palette = roll > 0.86 ? ACCENT : MINT;
        const hex = palette[Math.floor(rand() * palette.length)];
        const c = parseHex(hex);
        const wBlock = Math.min(unit, size - x);
        const hBlock = Math.min(unit, size - y);
        for (let dy = 0; dy < hBlock; dy += 1) {
          for (let dx = 0; dx < wBlock; dx += 1) {
            setPixel(buf, size, size, x + dx, y + dy, c);
          }
        }
      }
    }
  };

  const left0 = Math.round(size * 0.12);
  const left1 = Math.round(size * 0.42);
  const right0 = Math.round(size * 0.58);
  const right1 = Math.round(size * 0.88);

  blocks(left0, left1);
  blocks(right0, right1);

  // 中间透明竖条（对应参考图中间的白色留白）
  for (let y = 0; y < size; y += 1) {
    for (let x = left1; x < right0; x += 1) {
      setPixel(buf, size, size, x, y, { r: 0, g: 0, b: 0, a: 0 });
    }
  }

  // 底部深色块
  const dark = parseHex('#1F2937');
  const bw = Math.max(2, Math.round(size * 0.12));
  const bx = Math.round(size / 2 - bw / 2);
  const by = size - Math.max(3, Math.round(size * 0.18));
  for (let y = by; y < by + Math.max(2, Math.round(size * 0.1)); y += 1) {
    for (let x = bx; x < bx + bw; x += 1) {
      setPixel(buf, size, size, x, y, dark);
    }
  }

  return buf;
}
