import React from 'react';

interface TelemetryPillProps {
  label: string;
  status?: 'ready' | 'active' | 'warning';
  subLabel?: string;
  className?: string;
}

export const TelemetryPill: React.FC<TelemetryPillProps> = ({
  label,
  status = 'ready',
  subLabel,
  className = '',
}) => {
  const ledColor =
    status === 'active'
      ? 'bg-[var(--accent-laser)]'
      : status === 'warning'
      ? 'bg-amber-500'
      : 'bg-emerald-500';

  return (
    <div
      className={`inline-flex items-center gap-[6px] px-[8px] py-[3px] rounded-[3px] bg-[var(--bg-elevated)] border border-[var(--border-hairline)] font-mono text-[11px] text-[var(--text-muted)] tracking-wider ${className}`}
    >
      <span className={`w-[6px] h-[6px] rounded-full ${ledColor} animate-pulse shrink-0`} />
      <span className="text-[var(--text-primary)] font-medium">{label}</span>
      {subLabel && <span className="opacity-60 text-[10px]">// {subLabel}</span>}
    </div>
  );
};
