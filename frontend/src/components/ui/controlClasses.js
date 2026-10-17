import { cn } from './cn';

/** Estilo compartido por Input, Textarea y Select. */
export const controlClasses = (invalid) =>
  cn(
    'block w-full rounded-md border bg-white text-sm text-ink placeholder:text-ink-subtle transition-colors',
    'focus:outline-none focus:ring-2',
    'disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-subtle',
    invalid
      ? 'border-danger-600 focus:border-danger-600 focus:ring-danger-600/20'
      : 'border-line-input focus:border-brand-600 focus:ring-brand-600/20'
  );
