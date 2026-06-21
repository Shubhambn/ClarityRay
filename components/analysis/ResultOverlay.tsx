'use client';

import { useEffect, useRef } from 'react';
import type { Detection, SafeResult, SegmentationResult } from '@/lib/clarity/postprocess';

/**
 * Draws a model's spatial output faithfully on top of the scan: segmentation
 * masks as colour-coded translucent overlays, detection boxes as labelled
 * rectangles. Coordinates come straight from the interpreter (mask label map at
 * its native resolution; boxes normalized to [0, 1]) — nothing is reinterpreted.
 */

// Distinct, colour-blind-friendly hues, indexed by class.
const CLASS_COLORS: [number, number, number][] = [
  [239, 68, 68], // red
  [59, 130, 246], // blue
  [16, 185, 129], // green
  [245, 158, 11], // amber
  [168, 85, 247], // purple
  [236, 72, 153], // pink
  [20, 184, 166], // teal
  [250, 204, 21], // yellow
];

function drawMask(ctx: CanvasRenderingContext2D, seg: SegmentationResult, W: number, H: number): void {
  const { width: sw, height: sh, labelMap, opacity } = seg;
  if (sw <= 0 || sh <= 0) return;

  const tmp = document.createElement('canvas');
  tmp.width = sw;
  tmp.height = sh;
  const tctx = tmp.getContext('2d');
  if (!tctx) return;

  const imgData = tctx.createImageData(sw, sh);
  for (let i = 0; i < labelMap.length; i++) {
    const cls = labelMap[i];
    if (cls === 0) continue; // background
    const [r, g, b] = CLASS_COLORS[(cls - 1) % CLASS_COLORS.length];
    imgData.data[i * 4] = r;
    imgData.data[i * 4 + 1] = g;
    imgData.data[i * 4 + 2] = b;
    imgData.data[i * 4 + 3] = 255;
  }
  tctx.putImageData(imgData, 0, 0);

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.imageSmoothingEnabled = false; // keep mask pixels crisp when upscaled
  ctx.drawImage(tmp, 0, 0, sw, sh, 0, 0, W, H);
  ctx.restore();
}

function drawBoxes(ctx: CanvasRenderingContext2D, detections: Detection[], W: number, H: number): void {
  const lineWidth = Math.max(2, Math.round(W / 220));
  const fontSize = Math.max(11, Math.round(W / 42));
  ctx.save();
  ctx.lineWidth = lineWidth;
  ctx.font = `${fontSize}px var(--font-ui, sans-serif)`;
  ctx.textBaseline = 'top';

  for (const d of detections) {
    const x = d.box.x * W;
    const y = d.box.y * H;
    const w = d.box.w * W;
    const h = d.box.h * H;
    const color = d.suspicious ? '#ef4444' : '#22c55e';

    ctx.strokeStyle = color;
    ctx.strokeRect(x, y, w, h);

    const label = `${d.label} ${(d.score * 100).toFixed(0)}%`;
    const padding = 3;
    const textW = ctx.measureText(label).width;
    const labelY = y - fontSize - padding * 2 >= 0 ? y - fontSize - padding * 2 : y;

    ctx.fillStyle = color;
    ctx.fillRect(x, labelY, textW + padding * 2, fontSize + padding * 2);
    ctx.fillStyle = '#0b0b0b';
    ctx.fillText(label, x + padding, labelY + padding);
  }
  ctx.restore();
}

export function ResultOverlay({ imageUrl, result }: { imageUrl: string; result: SafeResult }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const W = img.naturalWidth || img.width || 224;
      const H = img.naturalHeight || img.height || 224;
      canvas.width = W;
      canvas.height = H;
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(img, 0, 0, W, H);

      if (result.segmentation) drawMask(ctx, result.segmentation, W, H);
      if (result.detections && result.detections.length > 0) drawBoxes(ctx, result.detections, W, H);
    };
    img.src = imageUrl;

    return () => {
      cancelled = true;
    };
  }, [imageUrl, result]);

  return (
    <canvas
      ref={canvasRef}
      aria-label="Model output overlaid on the scan"
      style={{
        maxWidth: '100%',
        maxHeight: '100%',
        objectFit: 'contain',
        display: 'block',
        margin: 'auto',
      }}
    />
  );
}
