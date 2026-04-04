'use client';

import { useState } from 'react';
import type { ClarityRayStatus, ModelInfo } from '@/hooks/useClarityRay';
import { UploadZone } from '@/components/UploadZone';

interface ControlPanelProps {
  status: ClarityRayStatus;
  modelInfo: ModelInfo | null;
  error: string | null;
  onRun: (file: File) => Promise<void>;
  onClear: () => void;
}

function statusDotColor(status: ClarityRayStatus): string {
  if (status === 'error') return '#ef4444';
  if (status === 'complete') return 'var(--accent-primary)';
  if (status === 'ready') return 'var(--accent-primary)';
  if (status === 'processing') return '#facc15';
  return '#9ca3af';
}

function statusLabel(status: ClarityRayStatus): string {
  switch (status) {
    case 'idle': return 'Awaiting scan';
    case 'loading_manifest': return 'Initializing system...';
    case 'loading_spec': return 'Loading specification...';
    case 'downloading_model': return 'Downloading model...';
    case 'verifying_model': return 'Verifying integrity...';
    case 'ready': return 'System ready';
    case 'processing': return 'Running inference...';
    case 'complete': return 'Analysis complete';
    case 'error': return 'System error';
    default: {
      const _exhaustive: never = status;
      return String(_exhaustive);
    }
  }
}

export function ControlPanel({ status, modelInfo, error, onRun, onClear }: ControlPanelProps) {
  const [currentFile, setCurrentFile] = useState<File | null>(null);

  const isDisabled = !(
    status === 'ready' || status === 'complete'
  );

  const handleFileSelected = (file: File) => {
    setCurrentFile(file);
    onRun(file);
  };
  const dotColor = statusDotColor(status);

  return (
    <div style={{ width: '280px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* System status card */}
      <div className="panel" style={{ padding: '14px' }}>
        <p className="mono" style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-secondary)', marginBottom: '10px' }}>
          SYSTEM
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <span
            className="status-dot"
            style={{ backgroundColor: dotColor, boxShadow: `0 0 6px ${dotColor}` }}
          />
          <span className="mono" style={{ fontSize: '12px', color: 'var(--text-primary)' }}>
            {statusLabel(status)}
          </span>
        </div>

        {modelInfo && (
          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <p className="mono" style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-secondary)' }}>
              MODEL
            </p>
            <p style={{ fontSize: '12px', color: 'var(--text-primary)', fontFamily: 'var(--font-ui)', lineHeight: 1.3 }}>
              {modelInfo.name}
            </p>
            <p className="mono" style={{ fontSize: '11px', color: 'var(--text-mono)' }}>
              v{modelInfo.version}
            </p>
          </div>
        )}
      </div>

      {/* Upload zone */}
      <UploadZone
        onFileSelected={handleFileSelected}
        isDisabled={isDisabled}
        currentFile={currentFile}
      />

      {/* Privacy badge */}
      <div
        className="panel"
        style={{
          padding: '12px 14px',
          borderLeft: '3px solid var(--accent-primary)',
        }}
      >
        <p className="mono" style={{ fontSize: '11px', color: 'var(--text-primary)', marginBottom: '4px' }}>
          🔒 Local Processing
        </p>
        <p style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)' }}>
          Your scan never leaves this device
        </p>
      </div>
    </div>
  );
}
