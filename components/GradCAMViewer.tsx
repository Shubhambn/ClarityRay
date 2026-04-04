'use client';

import { useEffect, useRef } from 'react';
import type { HeatmapData } from '@/lib/clarity/postprocess';
import { cn } from '@/lib/utils';

interface GradCAMViewerProps {
  imageUrl?: string | null;
  heatmap?: HeatmapData;
  /** Omit outer card chrome for embedding inside a scan frame. */
  embedded?: boolean;
  className?: string;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function heatToRgba(value: number): [number, number, number, number] {
  const x = clamp01(value);

  const r = clamp01(1.5 - Math.abs(4 * x - 3));
  const g = clamp01(1.5 - Math.abs(4 * x - 2));
  const b = clamp01(1.5 - Math.abs(4 * x - 1));
  const alpha = clamp01(x * 0.72);

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255), Math.round(alpha * 255)];
}

export function GradCAMViewer({ imageUrl, heatmap, embedded = false, className }: GradCAMViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hasImage = Boolean(imageUrl);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (!imageUrl) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const img = new Image();
    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      if (!heatmap || heatmap.values.length !== heatmap.width * heatmap.height) {
        return;
      }

      const overlayCanvas = document.createElement('canvas');
      overlayCanvas.width = heatmap.width;
      overlayCanvas.height = heatmap.height;
      const overlayCtx = overlayCanvas.getContext('2d');
      if (!overlayCtx) return;

      const imageData = overlayCtx.createImageData(heatmap.width, heatmap.height);

      for (let i = 0; i < heatmap.values.length; i++) {
        const [r, g, b, a] = heatToRgba(heatmap.values[i] ?? 0);
        const px = i * 4;
        imageData.data[px] = r;
        imageData.data[px + 1] = g;
        imageData.data[px + 2] = b;
        imageData.data[px + 3] = a;
      }

      overlayCtx.putImageData(imageData, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(overlayCanvas, 0, 0, canvas.width, canvas.height);
    };

    img.src = imageUrl;
  }, [imageUrl, heatmap]);

  const canvasBlock = (
    <div className="relative flex min-h-[200px] w-full flex-1 items-center justify-center overflow-hidden rounded-lg bg-slate-950/80">
      {hasImage ? (
        <canvas ref={canvasRef} className="max-h-[min(70vh,520px)] w-auto max-w-full object-contain" aria-label="X-ray heatmap overlay" />
      ) : (
        <div className="flex h-full min-h-[200px] w-full items-center justify-center px-4 text-center text-sm text-slate-500">
          Upload and run analysis to render the scan and attention overlay.
        </div>
      )}
    </div>
  );

  const footnote = (
    <p className="mt-2 text-xs italic text-zinc-500">
      Attention map is a visualization aid only. It approximates regions the model weighted during analysis and is not a
      precise localization of disease. Not a diagnostic feature.
    </p>
  );

  if (embedded) {
    return (
      <div className={cn('flex h-full min-h-0 flex-col', className)}>
        {canvasBlock}
        {footnote}
      </div>
    );
  }

  return (
    <div className={cn('card space-y-3', className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Heatmap overlay</h3>
        <span className="text-xs text-slate-400">Visual attention map</span>
      </div>
      {canvasBlock}
      {footnote}
    </div>
  );
}
