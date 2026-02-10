/**
 * Merge saved order with AI-generated order
 * Preserves user's saved ordering while appending any new items from AI
 */
export function mergeOrder(saved: string[], ai: string[]): string[] {
  const set = new Set(saved);
  const out = [...saved];

  // Append AI items that aren't in saved order
  for (const id of ai) {
    if (!set.has(id)) {
      out.push(id);
    }
  }

  return out;
}

const VALID_BUCKETS = ["now", "next", "later", "backlog"] as const;
type BucketLower = typeof VALID_BUCKETS[number];

/**
 * Get bucket name in lowercase for API/storage consistency
 */
export function normalizeBucket(bucket: string): BucketLower {
  const lower = bucket.toLowerCase();
  if (VALID_BUCKETS.includes(lower as BucketLower)) {
    return lower as BucketLower;
  }
  return "backlog"; // Safe default for unrecognized values
}

/**
 * Get bucket name in title case for display
 */
export function bucketToTitle(bucket: string): "Now" | "Next" | "Later" | "Backlog" {
  const normalized = normalizeBucket(bucket);
  return (normalized.charAt(0).toUpperCase() + normalized.slice(1)) as "Now" | "Next" | "Later" | "Backlog";
}
