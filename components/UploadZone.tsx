'use client';

import { useRef, useState, useCallback, useEffect } from 'react';

interface UploadZoneProps {
  onFileSelected: (file: File) => void;
  isDisabled: boolean;
}

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/jpg'];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadZone({ onFileSelected, isDisabled }: UploadZoneProps) {
  const [isDragging, setIsDragging]         = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [thumbnailUrl, setThumbnailUrl]      = useState<string | null>(null);
  const [selectedFile, setSelectedFile]      = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const thumbnailRef = useRef<string | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (thumbnailRef.current) {
        URL.revokeObjectURL(thumbnailRef.current);
      }
    };
  }, []);

  const processFile = useCallback(
    (file: File) => {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        setValidationError('Only PNG and JPEG files accepted');
        return;
      }
      setValidationError(null);
      setSelectedFile(file);

      if (thumbnailRef.current) {
        URL.revokeObjectURL(thumbnailRef.current);
      }

      const nextUrl = URL.createObjectURL(file);
      thumbnailRef.current = nextUrl;
      setThumbnailUrl(nextUrl);
      onFileSelected(file);
    },
    [onFileSelected],
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    // Reset so the same file can be re-selected
    e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDisabled) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    // Only clear drag state if leaving the zone entirely (not entering a child)
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (isDisabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handleClick = () => {
    if (!isDisabled) inputRef.current?.click();
  };

  const handleChangeFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    inputRef.current?.click();
  };

  /* ── Derived styles ── */
  const borderColor = isDragging
    ? 'var(--border-accent-strong, var(--accent-primary))'
    : 'var(--border-accent)';
  const bg = isDragging
    ? 'var(--accent-primary-glow, rgba(34,197,94,0.06))'
    : 'transparent';

  return (
    <div
      role="button"
      tabIndex={isDisabled ? -1 : 0}
      aria-disabled={isDisabled}
  aria-label={selectedFile ? `Selected file: ${selectedFile.name}. Click to change.` : 'Upload X-ray image'}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') handleClick();
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        padding: '32px 24px',
        borderRadius: '12px',
        border: `1.5px dashed ${borderColor}`,
        background: bg,
        opacity: isDisabled ? 0.4 : 1,
  cursor: isDisabled ? 'not-allowed' : selectedFile ? 'default' : 'pointer',
        pointerEvents: isDisabled ? 'none' : 'auto',
        transition: 'all var(--transition-fast, 150ms ease)',
        textAlign: 'center',
        userSelect: 'none',
        minHeight: '160px',
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg"
        style={{ display: 'none' }}
        onChange={handleInputChange}
        disabled={isDisabled}
        tabIndex={-1}
      />

      {isDragging ? (
        /* ── DRAG OVER STATE ── */
        <>
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--accent-primary)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <span
            style={{
              fontFamily: 'var(--font-ui)',
              fontSize: '15px',
              fontWeight: 600,
              color: 'var(--text-primary)',
            }}
          >
            Release to upload
          </span>
        </>
  ) : selectedFile ? (
        /* ── FILE SELECTED STATE ── */
        <>
          {thumbnailUrl && (
            <img
              src={thumbnailUrl}
              alt="X-ray thumbnail"
              style={{
                width: '80px',
                height: '80px',
                objectFit: 'cover',
                borderRadius: '6px',
                border: '1px solid var(--border-accent)',
              }}
            />
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span
              style={{
                fontFamily: 'var(--font-ui)',
                fontSize: '13px',
                color: 'var(--text-primary)',
                fontWeight: 500,
                wordBreak: 'break-all',
                maxWidth: '220px',
              }}
            >
              {selectedFile.name}
            </span>
            <span
              className="mono"
              style={{ fontSize: '11px', color: 'var(--text-secondary)' }}
            >
              {formatBytes(selectedFile.size)}
            </span>
          </div>

          <button
            onClick={handleChangeFile}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              fontFamily: 'var(--font-ui)',
              fontSize: '12px',
              color: 'var(--text-accent, var(--accent-primary))',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            Change file
          </button>
        </>
      ) : (
        /* ── DEFAULT STATE ── */
        <>
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--text-accent, var(--accent-primary))"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span
              style={{
                fontFamily: 'var(--font-ui)',
                fontSize: '15px',
                fontWeight: 600,
                color: 'var(--text-primary)',
              }}
            >
              Drop X-ray here
            </span>
            <span
              style={{
                fontFamily: 'var(--font-ui)',
                fontSize: '13px',
                color: 'var(--text-tertiary, var(--text-secondary))',
              }}
            >
              or click to browse
            </span>
          </div>

          <span
            className="mono"
            style={{
              fontSize: '11px',
              color: 'var(--text-tertiary, var(--text-secondary))',
            }}
          >
            PNG or JPEG only
          </span>
        </>
      )}

      {/* Inline validation error */}
      {validationError && (
        <span
          role="alert"
          style={{
            fontFamily: 'var(--font-ui)',
            fontSize: '12px',
            color: 'var(--color-error, #f87171)',
            marginTop: '4px',
          }}
        >
          {validationError}
        </span>
      )}
    </div>
  );
}
