import * as React from 'react';
import { cn } from '@/lib/utils';

type ButtonVariant = 'primary' | 'ghost' | 'dark' | 'outline';
type ButtonSize = 'sm' | 'md' | 'lg';

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--g)] text-white border border-transparent hover:bg-[var(--gd)] focus-visible:ring-[var(--g)]',
  ghost:
    'bg-transparent text-[var(--ink2)] border border-[var(--border)] hover:bg-white/5 hover:text-[var(--ink)] focus-visible:ring-[var(--gm)]',
  dark: 'bg-zinc-900 text-white border border-[var(--border)] hover:bg-zinc-800 focus-visible:ring-[var(--g)]',
  outline:
    'bg-black/30 text-[var(--ink)] border border-[var(--border)] hover:bg-white/5 focus-visible:ring-[var(--gm)]'
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-[15px]'
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', fullWidth = false, type = 'button', ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-[10px] font-medium transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2',
        variantStyles[variant],
        sizeStyles[size],
        fullWidth && 'w-full',
        className
      )}
      {...props}
    />
  );
});
