/**
 * Coerce various input types to a valid string subtask
 * Returns null if the input cannot be meaningfully converted
 */
export function coerceToStringSubtask(input: unknown): string | null {
  // Already a string - just trim and validate
  if (typeof input === "string") {
    const s = input.trim();
    return s.length > 0 ? s : null;
  }

  // Arrays - join nested arrays into a readable list
  if (Array.isArray(input)) {
    const flat = input.flat(Infinity).map((v) => String(v).trim()).filter(Boolean);
    const joined = flat.join(", ");
    return joined.length > 0 ? joined : null;
  }

  // Objects - try to extract a meaningful string
  if (input && typeof input === "object") {
    const obj = input as Record<string, unknown>;

    // Try common keys that might contain the subtask description
    const commonKeys = ["title", "text", "step", "description", "name"];
    const key = commonKeys.find(
      (k) => typeof obj[k] === "string" && String(obj[k]).trim().length > 0
    );

    if (key) {
      return String(obj[key]).trim();
    }

    // Fallback: compact JSON (but avoid huge blobs)
    try {
      const s = JSON.stringify(obj);
      return s && s.length <= 200 ? s : null;
    } catch {
      // If JSON.stringify fails, return null
      return null;
    }
  }

  // Cannot convert other types
  return null;
}

/**
 * Normalize subtasks array to ensure all items are unique strings
 * Handles mixed types, nested arrays, and objects from AI responses
 */
export function normalizeSubtasks(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const out: string[] = [];

  for (const item of value) {
    const s = coerceToStringSubtask(item);
    if (s && !out.includes(s)) {
      out.push(s);
    }
  }

  return out;
}
