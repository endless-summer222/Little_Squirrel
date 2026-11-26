import type { Layer, Project } from './types';

function toBase64(bytes: Uint8ClampedArray): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function fromBase64(s: string): Uint8ClampedArray {
  const bin = atob(s);
  const out = new Uint8ClampedArray(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

/** 工程序列化为 .uvproj（JSON + base64 像素） */
export function serializeProject(project: Project): string {
  const layers = (project.layers ?? []).map((l) => ({
    ...l,
    pixels: toBase64(l.pixels),
  }));
  return JSON.stringify({
    format: 'pixeluv',
    version: 1,
    project: { ...project, layers },
  });
}

export function parseProject(text: string): Project {
  const data = JSON.parse(text) as {
    format?: string;
    project?: Project & { layers?: (Layer & { pixels: string | Uint8ClampedArray })[] };
  };
  if (data.format !== 'pixeluv' || !data.project) throw new Error('不是 .uvproj 文件');
  const p = data.project;
  const layers = (p.layers ?? []).map((l) => ({
    ...l,
    pixels:
      typeof l.pixels === 'string' ? fromBase64(l.pixels) : new Uint8ClampedArray(l.pixels),
  }));
  return { ...p, layers, activeLayerId: p.activeLayerId ?? layers[0]?.id };
}

function isNative(): boolean {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return !!cap?.isNativePlatform?.();
}

export async function saveProjectFile(project: Project): Promise<string> {
  const text = serializeProject(project);
  const filename = `${(project.name || 'project').replace(/[\\/:*?"<>|]+/g, '_')}.uvproj`;
  if (isNative()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const b64 = btoa(unescape(encodeURIComponent(text)));
    await Filesystem.writeFile({
      path: `PixelUV/${filename}`,
      data: b64,
      directory: Directory.Documents,
      recursive: true,
    });
    return `Documents/PixelUV/${filename}`;
  }
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  return `浏览器下载目录/${filename}`;
}
