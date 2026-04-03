import { cn } from '@/lib/utils';

interface ToggleProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}

export function Toggle({ label, description, checked, onChange, disabled = false }: ToggleProps) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-[var(--border)] bg-white p-4">
      <div>
        <p className="text-sm font-medium text-[var(--ink)]">{label}</p>
        {description ? <p className="mt-1 text-xs text-[var(--muted)]">{description}</p> : null}
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-6 w-11 items-center rounded-full border transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60',
          checked
            ? 'border-[var(--g)] bg-[var(--g)] focus-visible:ring-[color-mix(in_srgb,var(--gm)_35%,transparent)]'
            : 'border-[var(--border)] bg-[var(--off)] focus-visible:ring-[var(--border)]'
        )}
      >
        <span
          className={cn(
            'inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-200',
            checked ? 'translate-x-5' : 'translate-x-0.5'
          )}
        />
      </button>
    </div>
  );
}
