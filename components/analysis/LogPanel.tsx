'use client';

import { useEffect, useRef } from 'react';
import type { SystemLog } from '@/hooks/useClarityRay';

interface LogPanelProps {
  logs: SystemLog[];
}

const LOG_COLORS: Record<SystemLog['level'], string> = {
  info: 'var(--text-3)',
  success: 'var(--text-green)',
  warn: '#fbbf24',
  error: 'var(--text-danger)',
};

function formatLevel(level: SystemLog['level']): string {
  return level.toUpperCase();
}

// function formatTime(date: Date): string {
function formatTime(date: Date): string {
  const d = new Date(date);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function LogPanel({ logs }: LogPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs.length]);
  

  return (
    <div
      ref={containerRef}
      className="panel"
      style={{
        maxHeight: '160px',
        overflowY: 'auto',
        borderTop: '1px solid var(--border-subtle)',
        padding: '8px 12px 10px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '8px',
          gap: '8px',
        }}
      >
        <p
          className="mono"
          style={{
            fontSize: '10px',
            letterSpacing: '0.12em',
            color: 'var(--text-tertiary)',
          }}
        >
          SYSTEM LOG
        </p>
        <span
          className="mono"
          style={{
            fontSize: '10px',
            color: 'var(--text-tertiary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '999px',
            padding: '0 6px',
            lineHeight: 1.6,
          }}
          aria-label={`Log count: ${logs.length}`}
        >
          {logs.length}
        </span>
      </div>

      {logs.length === 0 ? (
        <span className="mono" style={{ fontSize: '11px', color: 'var(--text-3)' }}>
          No events yet.
        </span>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          {logs.map((log) => (
            <div
              key={log.id}
              className="mono"
              style={{
                fontSize: '11px',
                color: LOG_COLORS[log.level],
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              <span style={{ color: 'var(--text-tertiary)' }}>[{formatTime(log.timestamp)}]</span>{' '}
              {formatLevel(log.level)} {log.message}
            </div>
          ))}
          <div ref={endRef} />
        </div>
      )}
    </div>
  );
}
