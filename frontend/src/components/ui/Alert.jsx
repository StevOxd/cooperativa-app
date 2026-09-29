import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { cn } from './cn';

const TONES = {
  info: { box: 'bg-brand-50 border-brand-200 text-brand-900', icon: Info, iconColor: 'text-brand-700' },
  success: { box: 'bg-success-50 border-success-200 text-success-900', icon: CheckCircle2, iconColor: 'text-success-700' },
  warning: { box: 'bg-warning-50 border-warning-200 text-warning-900', icon: AlertTriangle, iconColor: 'text-warning-700' },
  danger: { box: 'bg-danger-50 border-danger-200 text-danger-900', icon: AlertCircle, iconColor: 'text-danger-700' },
};

/**
 * Mensaje en línea. Los de tono `danger` se anuncian de inmediato a lectores
 * de pantalla (`role="alert"`); los demás, de forma cortés (`role="status"`).
 *
 * @param {Object} props
 * @param {'info'|'success'|'warning'|'danger'} [props.tone='info']
 * @param {React.ReactNode} [props.title]
 * @param {React.ElementType} [props.icon] - Reemplaza el ícono por defecto del tono.
 */
export const Alert = ({ tone = 'info', title, icon, className, children }) => {
  const { box, icon: DefaultIcon, iconColor } = TONES[tone];
  const Icon = icon || DefaultIcon;

  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('flex items-start gap-3 rounded-md border px-4 py-3 text-sm', box, className)}
    >
      <Icon className={cn('mt-0.5 w-4 h-4 shrink-0', iconColor)} aria-hidden="true" />
      <div className="min-w-0 space-y-0.5">
        {title && <p className="font-medium">{title}</p>}
        {children && <div>{children}</div>}
      </div>
    </div>
  );
};

export default Alert;
