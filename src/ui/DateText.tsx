import { formatInTimeZone } from 'date-fns-tz';

type Props = {
  value: string | Date | null | undefined;
  tz?: string;                 // optional override
  variant?: 'long' | 'short';  // card text vs chip
  fallback?: string;
};

export function DateText({ value, tz, variant = 'long', fallback = 'No deadline' }: Props) {
  if (!value) return <span className="opacity-60">{fallback}</span>;

  const z = tz ?? (typeof window !== 'undefined'
    ? JSON.parse(localStorage.getItem('tidy.settings') || '{}')?.work?.timezone
    : process.env.TZ) ?? 'America/Phoenix';

  const d = typeof value === 'string' ? new Date(value) : value;
  if (isNaN(d.getTime())) return <span className="opacity-60">{fallback}</span>;

  const fmt = variant === 'short' ? "MMM d, yyyy" : "MMM d, yyyy 'at' h:mm a zzz";
  return <span>{formatInTimeZone(d, z, fmt)}</span>;
}
