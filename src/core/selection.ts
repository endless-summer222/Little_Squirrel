import type { Rect } from './layers';

export type SelMode = 'new' | 'add' | 'sub' | 'intersect';

export interface Selection {
  mask: Uint8Array;
  bounds: Rect;
}

export function boundsOf(mask: Uint8Array, w: number, h: number): Rect {
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y += 1) {
    const row = y * w;
    for (let x = 0; x < w; x += 1) {
      if (!mask[row + x]) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

export function makeSelection(mask: Uint8Array, w: number, h: number): Selection {
  return { mask, bounds: boundsOf(mask, w, h) };
}

export function emptyMask(w: number, h: number): Uint8Array {
  return new Uint8Array(w * h);
}

export function rectMask(w: number, h: number, r: Rect): Uint8Array {
  const mask = emptyMask(w, h);
  const x0 = Math.max(0, Math.min(w, r.x));
  const y0 = Math.max(0, Math.min(h, r.y));
  const x1 = Math.max(0, Math.min(w, r.x + r.w));
  const y1 = Math.max(0, Math.min(h, r.y + r.h));
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) mask[y * w + x] = 1;
  }
  return mask;
}

export function ellipseMask(w: number, h: number, r: Rect): Uint8Array {
  const mask = emptyMask(w, h);
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const rx = Math.max(0.5, r.w / 2);
  const ry = Math.max(0.5, r.h / 2);
  for (let y = Math.max(0, r.y); y < Math.min(h, r.y + r.h); y += 1) {
    for (let x = Math.max(0, r.x); x < Math.min(w, r.x + r.w); x += 1) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) mask[y * w + x] = 1;
    }
  }
  return mask;
}

/** 扫描线填充多边形（奇偶规则） */
export function polygonMask(
  w: number,
  h: number,
  points: { x: number; y: number }[],
): Uint8Array {
  const mask = emptyMask(w, h);
  if (points.length < 3) return mask;
  const xs: number[] = [];
  for (let y = 0; y < h; y += 1) {
    xs.length = 0;
    const py = y + 0.5;
    for (let i = 0; i < points.length; i += 1) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      if ((a.y <= py && b.y > py) || (b.y <= py && a.y > py)) {
        xs.push(a.x + ((py - a.y) / (b.y - a.y)) * (b.x - a.x));
      }
    }
    xs.sort((m, n) => m - n);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const x0 = Math.max(0, Math.ceil(xs[i] - 0.5));
      const x1 = Math.min(w - 1, Math.floor(xs[i + 1] - 0.5));
      for (let x = x0; x <= x1; x += 1) mask[y * w + x] = 1;
    }
  }
  return mask;
}

export function combineMask(
  base: Uint8Array | null,
  next: Uint8Array,
  mode: SelMode,
): Uint8Array {
  if (!base || mode === 'new') return next;
  const out = new Uint8Array(next.length);
  for (let i = 0; i < out.length; i += 1) {
    const a = base[i] > 0;
    const b = next[i] > 0;
    if (mode === 'add') out[i] = a || b ? 1 : 0;
    else if (mode === 'sub') out[i] = a && !b ? 1 : 0;
    else out[i] = a && b ? 1 : 0;
  }
  return out;
}

export function invertMask(mask: Uint8Array): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i += 1) out[i] = mask[i] ? 0 : 1;
  return out;
}

/** n>0 膨胀，n<0 腐蚀 */
export function morphMask(
  mask: Uint8Array,
  w: number,
  h: number,
  n: number,
): Uint8Array {
  let cur = mask;
  const steps = Math.abs(n);
  for (let s = 0; s < steps; s += 1) {
    const next = new Uint8Array(cur.length);
    const grow = n > 0;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const idx = y * w + x;
        const self = cur[idx] > 0;
        let all = true;
        for (let dy = -1; dy <= 1 && all; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h || !cur[ny * w + nx]) {
              all = false;
              break;
            }
          }
        }
        if (grow) {
          let any = false;
          for (let dy = -1; dy <= 1 && !any; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
              const nx = x + dx;
              const ny = y + dy;
              if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
              if (cur[ny * w + nx]) {
                any = true;
                break;
              }
            }
          }
          next[idx] = self || any ? 1 : 0;
        } else {
          next[idx] = self && all ? 1 : 0;
        }
      }
    }
    cur = next;
  }
  return cur;
}

export interface WandOptions {
  tolerance: number; // 0..255
  contiguous: boolean;
  sample: 'layer' | 'composite';
}

function closeEnough(
  d: { r: number; g: number; b: number; a: number },
  r: number,
  g: number,
  b: number,
  a: number,
  tol: number,
): boolean {
  return (
    Math.abs(d.r - r) <= tol &&
    Math.abs(d.g - g) <= tol &&
    Math.abs(d.b - b) <= tol &&
    Math.abs(d.a - a) <= tol
  );
}

export function magicWand(
  pixels: Uint8ClampedArray,
  w: number,
  h: number,
  sx: number,
  sy: number,
  opts: WandOptions,
): Uint8Array {
  const mask = emptyMask(w, h);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return mask;
  const start = (sy * w + sx) * 4;
  const r = pixels[start];
  const g = pixels[start + 1];
  const b = pixels[start + 2];
  const a = pixels[start + 3];

  if (!opts.contiguous) {
    for (let i = 0; i < w * h; i += 1) {
      const p = i * 4;
      if (closeEnough({ r: pixels[p], g: pixels[p + 1], b: pixels[p + 2], a: pixels[p + 3] }, r, g, b, a, opts.tolerance)) {
        mask[i] = 1;
      }
    }
    return mask;
  }

  const stack: number[] = [sy * w + sx];
  const seen = new Uint8Array(w * h);
  while (stack.length) {
    const idx = stack.pop() as number;
    if (seen[idx]) continue;
    seen[idx] = 1;
    const p = idx * 4;
    if (!closeEnough({ r: pixels[p], g: pixels[p + 1], b: pixels[p + 2], a: pixels[p + 3] }, r, g, b, a, opts.tolerance)) continue;
    mask[idx] = 1;
    const x = idx % w;
    const y = (idx - x) / w;
    if (x > 0) stack.push(idx - 1);
    if (x < w - 1) stack.push(idx + 1);
    if (y > 0) stack.push(idx - w);
    if (y < h - 1) stack.push(idx + w);
  }
  return mask;
}

/** 只保留边缘线段，供蚂蚁线使用 */
export function selectionPath(mask: Uint8Array, w: number, h: number): Path2D {
  const path = new Path2D();
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!mask[y * w + x]) continue;
      const left = x === 0 ? 0 : mask[y * w + x - 1];
      const right = x === w - 1 ? 0 : mask[y * w + x + 1];
      const top = y === 0 ? 0 : mask[(y - 1) * w + x];
      const bottom = y === h - 1 ? 0 : mask[(y + 1) * w + x];
      if (!top) {
        path.moveTo(x, y);
        path.lineTo(x + 1, y);
      }
      if (!bottom) {
        path.moveTo(x, y + 1);
        path.lineTo(x + 1, y + 1);
      }
      if (!left) {
        path.moveTo(x, y);
        path.lineTo(x, y + 1);
      }
      if (!right) {
        path.moveTo(x + 1, y);
        path.lineTo(x + 1, y + 1);
      }
    }
  }
  return path;
}

export function pointInSelection(sel: Selection | null, x: number, y: number, w: number): boolean {
  if (!sel) return false;
  return sel.mask[y * w + x] > 0;
}


export function translateMask(
  mask: Uint8Array,
  w: number,
  h: number,
  dx: number,
  dy: number,
): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y += 1) {
    const sy = y - dy;
    if (sy < 0 || sy >= h) continue;
    for (let x = 0; x < w; x += 1) {
      const sx = x - dx;
      if (sx < 0 || sx >= w) continue;
      if (!mask[sy * w + sx]) continue;
      out[y * w + x] = 1;
    }
  }
  return out;
}
