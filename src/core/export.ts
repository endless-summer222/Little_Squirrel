import { createDemoTexture } from './pixels';
import { compositeLayers, ensureLayers } from './layers';
import type { Project } from './types';


let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, (blob: Blob | null) => void>();

function encodeInWorker(
  pixels: Uint8ClampedArray,
  w: number,
  h: number,
  scale: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      if (!worker) {
        worker = new Worker(new URL('../workers/image.worker.ts', import.meta.url), {
          type: 'module',
        });
        worker.onmessage = (e: MessageEvent<{ id: number; blob?: Blob; error?: string }>) => {
          const cb = pending.get(e.data.id);
          if (cb) {
            pending.delete(e.data.id);
            cb(e.data.error ? null : e.data.blob ?? null);
          }
        };
      }
      const id = ++seq;
      pending.set(id, resolve);
      const copy = new Uint8ClampedArray(pixels);
      worker.postMessage({ id, type: 'export', pixels: copy.buffer, w, h, scale }, [copy.buffer]);
      window.setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          resolve(null);
        }
      }, 15000);
    } catch {
      resolve(null);
    }
  });
}

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

async function renderBlob(project: Project, scale: number): Promise<{ blob: Blob; filename: string }> {
  const width = project.width;
  const height = project.height;
  if (!width || !height) throw new Error('empty canvas');

  const pixels =
    project.layers && project.layers.length > 0
      ? compositeLayers(ensureLayers(project), width, height)
      : createDemoTexture(Math.max(width, height), project.id);

  let blob = await encodeInWorker(pixels, width, height, scale);

  if (!blob) {
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
    blob = await new Promise<Blob | null>((resolve) => output.toBlob(resolve, 'image/png'));
  }

  if (!blob) throw new Error('encode failed');
  const suffix = scale === 1 ? '' : `@${scale}x`;
  return { blob, filename: `${safeName(project.name)}${suffix}.png` };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result);
      resolve(s.slice(s.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function isNative(): boolean {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return !!cap?.isNativePlatform?.();
}

/**
 * 导出 PNG 并返回可展示的位置：Android 为 Documents/LittleSquirrel/文件名，Web 为浏览器下载目录。
 */
export async function saveProjectPng(project: Project, scale = 1): Promise<string> {
  const { blob, filename } = await renderBlob(project, scale);

  if (isNative()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const data = await blobToBase64(blob);
    const res = await Filesystem.writeFile({
      path: `LittleSquirrel/${filename}`,
      data,
      directory: Directory.Documents,
      recursive: true,
    });
    try {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title: filename, url: res.uri });
    } catch {
      // 用户取消分享不算失败
    }
    return `Documents/LittleSquirrel/${filename}`;
  }

  downloadBlob(blob, filename);
  return `浏览器下载目录/${filename}`;
}

export async function exportProjectPng(project: Project, scale = 1): Promise<string> {
  return saveProjectPng(project, scale);
}
