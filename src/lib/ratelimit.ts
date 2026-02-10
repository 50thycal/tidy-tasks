const buckets = new Map<string, { ts: number[] }>();
const MAX_BUCKETS = 10_000;
let lastEviction = 0;

export function hit(key: string, limit = 10, windowMs = 60_000) {
  const now = Date.now();

  // Evict stale buckets at most once per window to bound memory
  if (now - lastEviction > windowMs) {
    lastEviction = now;
    const staleKeys: string[] = [];
    buckets.forEach((v, k) => {
      if (v.ts.length === 0 || now - v.ts[v.ts.length - 1] >= windowMs) {
        staleKeys.push(k);
      }
    });
    staleKeys.forEach(k => buckets.delete(k));
    // Hard cap: if still too many, drop oldest entries
    if (buckets.size > MAX_BUCKETS) {
      const excess = buckets.size - MAX_BUCKETS;
      let count = 0;
      buckets.forEach((_, k) => {
        if (count < excess) { buckets.delete(k); count++; }
      });
    }
  }

  const b = buckets.get(key) ?? { ts: [] };

  // Drop old timestamps outside the window
  b.ts = b.ts.filter(t => now - t < windowMs);
  b.ts.push(now);
  buckets.set(key, b);

  const remaining = Math.max(0, limit - b.ts.length);
  const reset = windowMs - (now - b.ts[0]);

  return {
    allowed: b.ts.length <= limit,
    remaining,
    resetMs: Math.max(reset, 0)
  };
}

// Extract a client key from request (IP + user agent)
export function clientKey(req: Request) {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim()
          || req.headers.get('x-real-ip')
          || 'anon';
  const ua = req.headers.get('user-agent') ?? '';
  return `${ip}:${ua.slice(0, 40)}`;
}
