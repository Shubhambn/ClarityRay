'use client';

import { useState } from 'react';
import type { ClarityRayStatus } from '@/hooks/useClarityRay';
import type { HeatmapData } from '@/lib/clarity/postprocess';
import { GradCAMViewer } from '@/components/GradCAMViewer';

interface ScanViewerProps {
  status: ClarityRayStatus;
  imageUrl: string | null;
  heatmap?: HeatmapData;
  fileName?: string;
  fileSize?: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ScanViewer({ status, imageUrl, heatmap, fileName, fileSize }: ScanViewerProps) {
  const [showHeatmap, setShowHeatmap] = useState<boolean>(false);

  const isEmpty = !imageUrl;
  const isProcessing = status === 'processing';
  const isComplete = status === 'complete';
  const hasHeatmap = isComplete && !!heatmap;

  return (
    <div
      className="panel"
      style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        padding: 0,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Header bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 14px',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <p className="mono" style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-secondary)' }}>
          SCAN VIEW
        </p>

        {hasHeatmap && (
          <button
            onClick={() => setShowHeatmap((prev) => !prev)}
            style={{
              background: 'none',
              border: '1px solid var(--border-accent)',
              color: 'var(--accent-primary)',
              padding: '3px 10px',
              borderRadius: '4px',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              cursor: 'pointer',
              letterSpacing: '0.04em',
            }}
          >
            {showHeatmap ? 'Show Original' : 'Show Heatmap'}
          </button>
        )}
      </div>

      {/* Main content area */}
      <div style={{ flex: 1, position: 'relative', minHeight: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>

        {/* Empty state */}
        {isEmpty && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            width: '100%',
            height: '100%',
            padding: '40px',
            border: '1px dashed var(--border-accent)',
            margin: '20px',
            borderRadius: '8px',
          }}>
            <p className="mono" style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>No scan loaded</p>
            <p className="mono" style={{ fontSize: '12px', color: 'var(--text-secondary)', opacity: 0.6 }}>Upload a chest X-ray to begin</p>
          </div>
        )}

        {/* Image loaded state */}
        {!isEmpty && (
          <>
            {/* Corner brackets - top left */}
            <span style={{
              position: 'absolute', top: '12px', left: '12px',
              width: '16px', height: '16px',
              borderTop: '2px solid var(--accent-primary)',
              borderLeft: '2px solid var(--accent-primary)',
              zIndex: 5, pointerEvents: 'none',
            }} />
            {/* Corner brackets - top right */}
            <span style={{
              position: 'absolute', top: '12px', right: '12px',
              width: '16px', height: '16px',
              borderTop: '2px solid var(--accent-primary)',
              borderRight: '2px solid var(--accent-primary)',
              zIndex: 5, pointerEvents: 'none',
            }} />
            {/* Corner brackets - bottom left */}
            <span style={{
              position: 'absolute', bottom: '12px', left: '12px',
              width: '16px', height: '16px',
              borderBottom: '2px solid var(--accent-primary)',
              borderLeft: '2px solid var(--accent-primary)',
              zIndex: 5, pointerEvents: 'none',
            }} />
            {/* Corner brackets - bottom right */}
            <span style={{
              position: 'absolute', bottom: '12px', right: '12px',
              width: '16px', height: '16px',
              borderBottom: '2px solid var(--accent-primary)',
              borderRight: '2px solid var(--accent-primary)',
              zIndex: 5, pointerEvents: 'none',
            }} />

            {/* Image or GradCAM */}
            {hasHeatmap && showHeatmap ? (
              <GradCAMViewer
                imageUrl={imageUrl}
                heatmap={heatmap}
                embedded
                className="w-full h-full"
              />
            ) : (
              <img
                src={imageUrl}
                alt="Uploaded chest X-ray"
                style={{
                  maxWidth: '100%',
                  maxHeight: '65vh',
                  objectFit: 'contain',
                  border: '2px solid var(--border-accent)',
                  borderRadius: '4px',
                  display: 'block',
                }}
              />
            )}

            {/* Processing overlay */}
            {isProcessing && (
              <div style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                background: 'rgba(0,0,0,0.65)',
                zIndex: 10,
              }}>
                <div style={{
                  width: '28px',
                  height: '28px',
                  border: '3px solid rgba(34,197,94,0.2)',
                  borderTop: '3px solid var(--accent-primary)',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }} />
                <p className="mono" style={{ fontSize: '12px', color: 'var(--text-primary)' }}>Analyzing...</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Image label */}
      {!isEmpty && (fileName || fileSize) && (
        <div style={{ padding: '8px 14px', borderTop: '1px solid var(--border-subtle)' }}>
          <p className="mono" style={{ fontSize: '10px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {fileName}{fileSize !== undefined ? ` · ${formatBytes(fileSize)}` : ''}
          </p>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
