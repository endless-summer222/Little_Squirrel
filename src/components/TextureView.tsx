import { useEffect, useRef } from 'react';

interface Props {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  className?: string;
}

export function TextureView({ pixels, width, height, className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    cv.width = width;
    cv.height = height;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0);
  }, [pixels, width, height]);

  return <canvas ref={ref} className={className} width={width} height={height} />;
}
