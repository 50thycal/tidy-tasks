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

/**
 * Get bucket name in lowercase for API/storage consistency
 */
export function normalizeBucket(bucket: string): "now" | "next" | "later" | "backlog" {
  return bucket.toLowerCase() as "now" | "next" | "later" | "backlog";
}

/**
 * Get bucket name in title case for display
 */
export function bucketToTitle(bucket: string): "Now" | "Next" | "Later" | "Backlog" {
  const lower = bucket.toLowerCase();
  return (lower.charAt(0).toUpperCase() + lower.slice(1)) as "Now" | "Next" | "Later" | "Backlog";
}
