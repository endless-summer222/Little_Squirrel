import type { BlendMode, Layer, Project } from './types';

let seq = 0;
export function newLayerId(): string {
  seq += 1;
  return `lyr_${Date.now().toString(36)}_${seq}`;
}

export function createLayer(
  width: number,
  height: number,
  name: string,
  pixels?: Uint8ClampedArray,
): Layer {
  return {
    id: newLayerId(),
    name,
    visible: true,
    locked: false,
    opacity: 1,
    blend: 'normal',
    pixels: pixels ?? new Uint8ClampedArray(width * height * 4),
  };
}

export const BLEND_TO_GCO: Record<BlendMode, GlobalCompositeOperation> = {
  normal: 'source-over',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  darken: 'darken',
  lighten: 'lighten',
  'color-dodge': 'color-dodge',
  'color-burn': 'color-burn',
  'hard-light': 'hard-light',
  'soft-light': 'soft-light',
  difference: 'difference',
  exclusion: 'exclusion',
  hue: 'hue',
  saturation: 'saturation',
  color: 'color',
  luminosity: 'luminosity',
};

/** 把旧工程的单缓冲迁移成单图层；已有 layers 则原样返回 */
export function ensureLayers(project: Project): Layer[] {
  if (project.layers && project.layers.length > 0) return project.layers;
  const width = project.width;
  const height = project.height;
  const pixels =
    project.pixels && project.pixels.length === width * height * 4
      ? project.pixels
      : new Uint8ClampedArray(width * height * 4);
  return [createLayer(width, height, '图层 1', pixels)];
}

export function activeLayer(layers: Layer[], activeId?: string): Layer {
  return layers.find((l) => l.id === activeId) ?? layers[layers.length - 1];
}

/**
 * 一次性合成（缩略图 / 导出用）。
 * 逐层 putImageData 到临时画布，再用 Canvas 的混合模式叠加。
 */
export function compositeLayers(
  layers: Layer[],
  width: number,
  height: number,
): Uint8ClampedArray {
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const ctx = out.getContext('2d');
  if (!ctx) return new Uint8ClampedArray(width * height * 4);

  const tmp = document.createElement('canvas');
  tmp.width = width;
  tmp.height = height;
  const tctx = tmp.getContext('2d');
  if (!tctx) return new Uint8ClampedArray(width * height * 4);

  for (const layer of [...layers].reverse()) {
    if (!layer.visible || layer.opacity <= 0) continue;
    tctx.clearRect(0, 0, width, height);
    tctx.putImageData(
      new ImageData(new Uint8ClampedArray(layer.pixels), width, height),
      0,
      0,
    );
    ctx.globalAlpha = layer.opacity;
    ctx.globalCompositeOperation = BLEND_TO_GCO[layer.blend] ?? 'source-over';
    ctx.drawImage(tmp, 0, 0);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  return ctx.getImageData(0, 0, width, height).data;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function unionRect(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const r = Math.max(a.x + a.w, b.x + b.w);
  const bt = Math.max(a.y + a.h, b.y + b.h);
  return { x, y, w: r - x, h: bt - y };
}

export function fullRect(width: number, height: number): Rect {
  return { x: 0, y: 0, w: width, h: height };
}
