/**
 * Run items through a worker function with limited concurrency
 * @param items - Array of items to process
 * @param limit - Maximum number of concurrent operations
 * @param worker - Function to process each item
 * @param onProgress - Optional callback for progress updates
 * @returns Array of results (undefined for failed items)
 */
export async function runWithPool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
  onProgress?: (index: number, status: "running" | "success" | "failed", data?: R | any) => void
): Promise<(R | undefined)[]> {
  const results: (R | undefined)[] = new Array(items.length);
  let i = 0;
  const inFlight: Promise<void>[] = [];

  async function next(): Promise<void> {
    const idx = i++;
    if (idx >= items.length) return;

    onProgress?.(idx, "running");

    try {
      const r = await worker(items[idx], idx);
      results[idx] = r;
      onProgress?.(idx, "success", r);
    } catch (e) {
      results[idx] = undefined;
      onProgress?.(idx, "failed", e);
    }

    await next();
  }

  // Start up to 'limit' concurrent workers
  for (let k = 0; k < Math.min(limit, items.length); k++) {
    inFlight.push(next());
  }

  await Promise.all(inFlight);
  return results;
}

/**
 * Tolerant task splitter - handles various formats
 */
export function splitTasks(text: string): string[] {
  return text
    .split(/\r?\n|[;•]|(?:\s-\s)|(?:\s\|\s)/g)
    .map((line) => line.trim())
    .filter(Boolean);
}
