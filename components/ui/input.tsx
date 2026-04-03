import * as React from 'react';
import { cn } from '@/lib/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, id, error, hint, className, ...props },
  ref
) {
  const fallbackId = React.useId();
  const inputId = id ?? fallbackId;

  return (
    <label htmlFor={inputId} className="flex w-full flex-col gap-1.5">
      <span className="text-xs font-medium text-[var(--ink2)]">{label}</span>
      <input
        ref={ref}
        id={inputId}
        className={cn(
          'h-11 rounded-[10px] border bg-white px-3.5 text-sm text-[var(--ink)] transition-colors duration-200 placeholder:text-[var(--muted)] focus-visible:outline-none focus-visible:ring-2',
          error
            ? 'border-red-300 focus-visible:ring-red-200'
            : 'border-[var(--border)] focus-visible:ring-[color-mix(in_srgb,var(--gm)_30%,transparent)]',
          className
        )}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
        {...props}
      />
      {hint && !error ? (
        <span id={`${inputId}-hint`} className="text-xs text-[var(--muted)]">
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={`${inputId}-error`} className="text-xs text-red-600">
          {error}
        </span>
      ) : null}
    </label>
  );
});
