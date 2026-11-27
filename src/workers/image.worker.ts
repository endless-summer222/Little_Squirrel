/// <reference lib="webworker" />
import { magicWand } from '../core/selection';

interface WandMsg {
  id: number;
  type: 'wand';
  pixels: ArrayBuffer;
  w: number;
  h: number;
  x: number;
  y: number;
  tolerance: number;
  contiguous: boolean;
}

interface ExportMsg {
  id: number;
  type: 'export';
  pixels: ArrayBuffer;
  w: number;
  h: number;
  scale: number;
}

type Msg = WandMsg | ExportMsg;

self.onmessage = async (e: MessageEvent<Msg>) => {
  const msg = e.data;
  try {
    if (msg.type === 'wand') {
      const pixels = new Uint8ClampedArray(msg.pixels);
      const mask = magicWand(pixels, msg.w, msg.h, msg.x, msg.y, {
        tolerance: msg.tolerance,
        contiguous: msg.contiguous,
        sample: 'composite',
      });
      (self as unknown as Worker).postMessage({ id: msg.id, mask }, [mask.buffer]);
      return;
    }

    if (msg.type === 'export') {
      const pixels = new Uint8ClampedArray(msg.pixels);
      const base = new OffscreenCanvas(msg.w, msg.h);
      const bctx = base.getContext('2d');
      if (!bctx) throw new Error('no ctx');
      bctx.putImageData(new ImageData(pixels, msg.w, msg.h), 0, 0);
      let out = base;
      if (msg.scale !== 1) {
        out = new OffscreenCanvas(msg.w * msg.scale, msg.h * msg.scale);
        const octx = out.getContext('2d');
        if (!octx) throw new Error('no ctx');
        octx.imageSmoothingEnabled = false;
        octx.drawImage(base, 0, 0, out.width, out.height);
      }
      const blob = await out.convertToBlob({ type: 'image/png' });
      (self as unknown as Worker).postMessage({ id: msg.id, blob });
    }
  } catch (err) {
    (self as unknown as Worker).postMessage({ id: msg.id, error: String(err) });
  }
};
