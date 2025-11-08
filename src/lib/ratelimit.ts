const buckets = new Map<string, { ts: number[] }>();

export function hit(key: string, limit = 10, windowMs = 60_000) {
  const now = Date.now();
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
