import { createDemoTexture } from './pixels';
import type { Project } from './types';

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function safeName(name: string): string {
  return (name || 'texture').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80);
}

/**
 * 导出工程为 PNG。
 * 目前是单图层像素缓冲；多图层合成接入后这里改成 blend.ts 的结果。
 */
export async function exportProjectPng(project: Project, scale = 1): Promise<void> {
  const width = project.width;
  const height = project.height;
  if (!width || !height) throw new Error('empty canvas');

  const pixels =
    project.pixels ?? createDemoTexture(Math.max(width, height), project.id);

  const native = document.createElement('canvas');
  native.width = width;
  native.height = height;
  const nctx = native.getContext('2d');
  if (!nctx) throw new Error('canvas unavailable');
  nctx.putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0);

  let output = native;
  if (scale !== 1) {
    const scaled = document.createElement('canvas');
    scaled.width = width * scale;
    scaled.height = height * scale;
    const sctx = scaled.getContext('2d');
    if (!sctx) throw new Error('canvas unavailable');
    sctx.imageSmoothingEnabled = false;
    sctx.drawImage(native, 0, 0, scaled.width, scaled.height);
    output = scaled;
  }

  const blob = await new Promise<Blob | null>((resolve) =>
    output.toBlob(resolve, 'image/png'),
  );
  if (!blob) throw new Error('encode failed');

  const suffix = scale === 1 ? '' : `@${scale}x`;
  downloadBlob(blob, `${safeName(project.name)}${suffix}.png`);
}
