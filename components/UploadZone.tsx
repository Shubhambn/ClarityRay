'use client';

import { useRef, useState } from 'react';
import type { AnalysisStatus } from '@/hooks/useClarityRay';

interface UploadZoneProps {
  onRun: (file: File) => Promise<void> | void;
  onClear?: () => void;
  status?: AnalysisStatus;
  error?: string | null;
}

export function UploadZone({ onRun, onClear, status = 'idle', error }: UploadZoneProps) {
  const [fileName, setFileName] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const dropRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const isBusy =
    status === 'loading_manifest' ||
    status === 'loading_spec' ||
    status === 'downloading_model' ||
    status === 'verifying_model' ||
    status === 'processing';

  const isReady = status === 'ready';

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];

    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) {
      setLocalError('Unsupported file type. Please use PNG or JPEG.');
      setSelectedFile(null);
      setFileName('');
      return;
    }

    setLocalError(null);
    setFileName(file.name);
    setSelectedFile(file);
  };

  const onDrop = (evt: React.DragEvent<HTMLDivElement>) => {
    evt.preventDefault();
    evt.stopPropagation();
    if (isBusy) return;
    handleFiles(evt.dataTransfer.files);
    dropRef.current?.classList.remove('border-accent');
  };

  const onDragOver = (evt: React.DragEvent<HTMLDivElement>) => {
    evt.preventDefault();
    evt.stopPropagation();
    dropRef.current?.classList.add('border-accent');
  };

  const onDragLeave = (evt: React.DragEvent<HTMLDivElement>) => {
    evt.preventDefault();
    evt.stopPropagation();
    dropRef.current?.classList.remove('border-accent');
  };

  return (
    <div className="card space-y-4">
      <div
        ref={dropRef}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 bg-white/5 px-6 py-10 text-center hover:border-white/40"
        onClick={() => inputRef.current?.click()}
      >
        <p className="text-lg font-semibold text-white">Drop a chest X-ray here</p>
        <p className="text-sm text-slate-400">or click to choose a file</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
          disabled={isBusy}
        />
        {fileName && <p className="text-xs text-slate-300">Selected: {fileName}</p>}
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="btn" onClick={() => inputRef.current?.click()} disabled={isBusy}>
          Choose File
        </button>
        <button
          className="btn bg-emerald-600"
          onClick={() => selectedFile && onRun(selectedFile)}
          disabled={isBusy || !selectedFile || !isReady}
        >
          Run Analysis
        </button>
        <button
          className="btn bg-slate-700"
          onClick={() => {
            setSelectedFile(null);
            setFileName('');
            setLocalError(null);
            if (inputRef.current) {
              inputRef.current.value = '';
            }
            onClear?.();
          }}
          disabled={isBusy || !selectedFile}
        >
          Clear
        </button>
      </div>

      <p className="text-xs text-emerald-300">Processing happens locally in your browser.</p>
      {status === 'loading_manifest' && <p className="text-xs text-slate-300">Loading model manifest...</p>}
      {status === 'loading_spec' && <p className="text-xs text-slate-300">Loading model specification...</p>}
      {status === 'downloading_model' && <p className="text-xs text-slate-300">Downloading model...</p>}
      {status === 'verifying_model' && <p className="text-xs text-slate-300">Verifying model integrity...</p>}
      {status === 'ready' && <p className="text-xs text-emerald-300">Model ready.</p>}
      {status === 'processing' && <p className="text-xs text-slate-300">Analyzing image...</p>}
      {(localError || error) && <p className="text-xs text-red-300">{localError ?? error}</p>}
    </div>
  );
}
