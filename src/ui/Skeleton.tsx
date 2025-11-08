export function Skeleton({
  h = 14,
  w = '100%',
  rounded = true,
  className = '',
}: { h?: number; w?: number|string; rounded?: boolean; className?: string; }) {
  return (
    <div
      className={`animate-pulse bg-white/10 ${rounded ? 'rounded-md' : ''} ${className}`}
      style={{ height: h, width: w }}
      aria-hidden="true"
    />
  );
}

export function SkeletonLines({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} h={12} w={i === lines - 1 ? '70%' : '100%'} />
      ))}
    </div>
  );
}
