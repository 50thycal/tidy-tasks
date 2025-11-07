/**
 * Coerce tags from various UI input formats to a clean string array
 */
export function coerceTags(input: string | string[]): string[] {
  let tags: string[];

  if (typeof input === "string") {
    // Split on commas or whitespace
    tags = input
      .split(/[,\s]+/)
      .map((tag) => tag.trim())
      .filter(Boolean);
  } else if (Array.isArray(input)) {
    tags = input.map((tag) => String(tag).trim()).filter(Boolean);
  } else {
    tags = [];
  }

  // Lowercase and unique
  const normalized = tags.map((tag) => tag.toLowerCase());
  return Array.from(new Set(normalized));
}

/**
 * Coerce subtasks from textarea or array to clean string array
 */
export function coerceSubtasks(input: string | string[]): string[] {
  let subtasks: string[];

  if (typeof input === "string") {
    // Split by newlines
    subtasks = input
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  } else if (Array.isArray(input)) {
    subtasks = input.map((item) => String(item).trim()).filter(Boolean);
  } else {
    subtasks = [];
  }

  // Remove duplicates while preserving order
  return Array.from(new Set(subtasks));
}

/**
 * Return null if string is empty/whitespace, otherwise return trimmed string
 */
export function nullIfEmpty(s?: string | null): string | null {
  if (!s || typeof s !== "string") return null;
  const trimmed = s.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Clamp a number to one of the allowed enum values
 * If the value is not in the allowed list, return the closest or a default
 */
export function clampEnum<T extends number>(
  value: number | undefined | null,
  allowed: T[],
  defaultValue: T
): T {
  if (value === undefined || value === null) return defaultValue;

  // If exact match, return it
  if (allowed.includes(value as T)) {
    return value as T;
  }

  // Otherwise find closest
  const sorted = [...allowed].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i++) {
    if (value <= sorted[i]) {
      return sorted[i];
    }
  }

  // If larger than all values, return largest
  return sorted[sorted.length - 1];
}
