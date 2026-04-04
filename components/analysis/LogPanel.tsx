'use client';

import type { SystemLog } from '@/hooks/useClarityRay';

interface LogPanelProps {
  logs: SystemLog[];
}

function levelColor(level: SystemLog['level']): string {
  if (level === 'error') return '#f87171';
  if (level === 'warn') return '#fbbf24';
  if (level === 'success') return 'var(--accent-primary)';
  return 'var(--text-secondary)';
}

function levelPrefix(level: SystemLog['level']): string {
  if (level === 'error') return '[ERR]';
  if (level === 'warn') return '[WARN]';
  if (level === 'success') return '[OK]';
  return '[INFO]';
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function LogPanel({ logs }: LogPanelProps) {
  return (
    <div
      className="panel"
      style={{
        padding: '12px 14px',
        maxHeight: '140px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexShrink: 0 }}>
        <span className="status-dot" style={{ backgroundColor: 'var(--accent-primary)', flexShrink: 0 }} />
        <p className="mono" style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-secondary)' }}>
          SYSTEM LOG
        </p>
      </div>

      <div style={{ overflowY: 'auto', flex: 1 }}>
        {logs.length === 0 ? (
          <p className="mono" style={{ fontSize: '11px', color: 'var(--text-secondary)', opacity: 0.5 }}>
            No events yet.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {logs.map((log) => (
              <div
                key={log.id}
                className="mono"
                style={{
                  fontSize: '11px',
                  color: levelColor(log.level),
                  lineHeight: 1.5,
                  display: 'flex',
                  gap: '8px',
                }}
              >
                <span style={{ opacity: 0.5, flexShrink: 0 }}>{formatTime(log.timestamp)}</span>
                <span style={{ opacity: 0.7, flexShrink: 0 }}>{levelPrefix(log.level)}</span>
                <span>{log.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
