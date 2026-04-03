'use client';

import React, { useRef, useEffect } from 'react';
import type { HeatmapData } from '@/lib/models/chestXray/heatmap';

interface ScannerPanelProps {
  imageUrl: string | null;
  heatmap: HeatmapData | null;
}

export function ScannerPanel({ imageUrl, heatmap }: ScannerPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Draw GradCAM on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageUrl) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);

      if (heatmap && heatmap.values.length === heatmap.width * heatmap.height) {
        const overlayCanvas = document.createElement('canvas');
        overlayCanvas.width = heatmap.width;
        overlayCanvas.height = heatmap.height;
        const overlayCtx = overlayCanvas.getContext('2d');
        if (!overlayCtx) return;

        const imageData = overlayCtx.createImageData(heatmap.width, heatmap.height);

        for (let i = 0; i < heatmap.values.length; i++) {
          const value = heatmap.values[i] ?? 0;
          const x = Math.min(1, Math.max(0, value));
          const r = Math.round(Math.min(1, Math.max(0, 1.5 - Math.abs(4 * x - 3))) * 255);
          const g = Math.round(Math.min(1, Math.max(0, 1.5 - Math.abs(4 * x - 2))) * 255);
          const b = Math.round(Math.min(1, Math.max(0, 1.5 - Math.abs(4 * x - 1))) * 255);
          const a = Math.round(Math.min(1, Math.max(0, x * 0.72)) * 255);

          const px = i * 4;
          imageData.data[px] = r;
          imageData.data[px + 1] = g;
          imageData.data[px + 2] = b;
          imageData.data[px + 3] = a;
        }

        overlayCtx.putImageData(imageData, 0, 0);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(overlayCanvas, 0, 0, canvas.width, canvas.height);
      }
    };
    img.src = imageUrl;
  }, [imageUrl, heatmap]);

  return (
    <div className="relative border border-green-500/20 rounded-xl overflow-hidden bg-gradient-to-br from-slate-950 to-black aspect-square">
      {/* Scan sweep animation */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-green-500/20 to-transparent"
        style={{
          animation: 'sweep 3s ease-in-out infinite',
          height: '2px'
        }}
      />

      {/* Corner brackets */}
      <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-green-500/60" />
      <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-green-500/60" />
      <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-green-500/60" />
      <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-green-500/60" />

      {imageUrl ? (
        <canvas
          ref={canvasRef}
          className="w-full h-full object-cover"
          aria-label="X-ray image with GradCAM overlay"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-slate-500 mono text-xs">
          Awaiting image...
        </div>
      )}

      {/* Bottom info bar */}
      {imageUrl && (
        <div className="absolute bottom-0 left-0 right-0 bg-black/75 backdrop-blur border-t border-green-500/10 px-3 py-2 flex justify-between items-center">
          <span className="mono text-xs text-green-500/70">CHEST-PA · DenseNet121 · GradCAM</span>
          <span className="mono text-xs text-white/50">Local inference</span>
        </div>
      )}
    </div>
  );
}
