'use client';

import { useState } from 'react';
import type { HeatmapData } from '@/lib/clarity/postprocess';
import type { SafeResult } from '@/lib/clarity/postprocess';
import type { Persona } from '@/lib/persona/context';
import type { ModelInfo } from '@/hooks/useClarityRay';
import { exportAsPDF, shareWhatsApp } from '@/lib/export/report';

interface ExportButtonProps {
  result: SafeResult;
  persona: Persona;
  modelInfo: ModelInfo | null;
  imageUrl?: string | null;
  activeHeatmap?: HeatmapData | null;
}

// ── Canvas helpers ─────────────────────────────────────────────────────────────

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

// Replicates ContrastViewer's heatToRgba for off-screen canvas rendering.
function heatToRgba(value: number): [number, number, number, number] {
  const x = clamp01(value);
  const r = clamp01(1.5 - Math.abs(4 * x - 3));
  const g = clamp01(1.5 - Math.abs(4 * x - 2));
  const b = clamp01(1.5 - Math.abs(4 * x - 1));
  const a = clamp01(x * 0.72);
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255), Math.round(a * 255)];
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function blobUrlToDataUrl(blobUrl: string): Promise<string | null> {
  try {
    const resp = await fetch(blobUrl);
    const blob = await resp.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Renders the original scan with the heatmap overlay applied on an off-screen
 * canvas — identical to ContrastViewer — and returns a PNG data URL.
 */
async function renderHeatmapToDataUrl(
  imageUrl: string,
  heatmap: HeatmapData,
): Promise<string | null> {
  try {
    const img = await loadImage(imageUrl);

    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(img, 0, 0);

    if (heatmap.values.length === heatmap.width * heatmap.height) {
      const overlayCanvas = document.createElement('canvas');
      overlayCanvas.width = heatmap.width;
      overlayCanvas.height = heatmap.height;
      const oc = overlayCanvas.getContext('2d');
      if (oc) {
        const id = oc.createImageData(heatmap.width, heatmap.height);
        for (let i = 0; i < heatmap.values.length; i++) {
          const [r, g, b, a] = heatToRgba(heatmap.values[i] ?? 0);
          const px = i * 4;
          id.data[px] = r;
          id.data[px + 1] = g;
          id.data[px + 2] = b;
          id.data[px + 3] = a;
        }
        oc.putImageData(id, 0, 0);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(overlayCanvas, 0, 0, canvas.width, canvas.height);
      }
    }

    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

// ── Styles ────────────────────────────────────────────────────────────────────

const BTN_BASE: React.CSSProperties = {
  flex: 1,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  padding: '8px 12px',
  fontSize: '11px',
  fontWeight: 600,
  borderRadius: 'var(--radius-md)',
  cursor: 'pointer',
  fontFamily: 'var(--font-mono)',
  letterSpacing: '0.03em',
  transition: 'opacity 0.15s',
};

function PdfIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function WAIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}

function Spinner() {
  return <div className="spinner" style={{ width: '11px', height: '11px' }} />;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ExportButton({
  result,
  persona,
  modelInfo,
  imageUrl,
  activeHeatmap,
}: ExportButtonProps) {
  const [pdfLoading, setPdfLoading] = useState(false);
  const [waLoading, setWaLoading] = useState(false);

  const handlePDF = async () => {
    if (pdfLoading) return;
    setPdfLoading(true);
    try {
      // Run scan + heatmap conversions in parallel
      const [imageDataUrl, heatmapDataUrl] = await Promise.all([
        imageUrl ? blobUrlToDataUrl(imageUrl) : Promise.resolve(null),
        imageUrl && activeHeatmap
          ? renderHeatmapToDataUrl(imageUrl, activeHeatmap)
          : Promise.resolve(null),
      ]);

      exportAsPDF({
        result,
        persona,
        modelInfo,
        imageDataUrl,
        heatmapDataUrl,
        heatmapMethod: activeHeatmap?.method ?? null,
      });
    } finally {
      setPdfLoading(false);
    }
  };

  const handleWhatsApp = () => {
    if (waLoading) return;
    setWaLoading(true);
    try {
      shareWhatsApp({ result, persona, modelInfo });
    } finally {
      setTimeout(() => setWaLoading(false), 800);
    }
  };

  const busy = pdfLoading || waLoading;

  return (
    <div>
      <div className="label" style={{ marginBottom: 'var(--space-2)' }}>
        EXPORT REPORT
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {/* ── PDF ── */}
        <button
          type="button"
          onClick={handlePDF}
          disabled={busy}
          title="Open a print-ready report — use 'Save as PDF' in the print dialog"
          style={{
            ...BTN_BASE,
            background: 'rgba(0,196,122,0.07)',
            color: 'var(--accent-primary)',
            border: '1px solid rgba(0,196,122,0.22)',
            opacity: busy ? 0.55 : 1,
            cursor: busy ? 'not-allowed' : 'pointer',
          }}
        >
          {pdfLoading ? <Spinner /> : <PdfIcon />}
          {pdfLoading ? 'Preparing...' : 'Export PDF'}
        </button>

        {/* ── WhatsApp ── */}
        <button
          type="button"
          onClick={handleWhatsApp}
          disabled={busy}
          title="Share this result via WhatsApp"
          style={{
            ...BTN_BASE,
            background: 'rgba(37,211,102,0.07)',
            color: '#25d366',
            border: '1px solid rgba(37,211,102,0.22)',
            opacity: busy ? 0.55 : 1,
            cursor: busy ? 'not-allowed' : 'pointer',
          }}
        >
          {waLoading ? <Spinner /> : <WAIcon />}
          {waLoading ? 'Opening...' : 'WhatsApp'}
        </button>
      </div>
    </div>
  );
}
