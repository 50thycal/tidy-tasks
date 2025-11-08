/**
 * Focus layout storage using localStorage
 * Stores user's custom ordering and bucket assignments for focus queue
 */

const STORAGE_KEY = "tidy.focus_layouts";

export interface FocusLayout {
  date: string; // YYYY-MM-DD in settings timezone
  lists: {
    now: string[];
    next: string[];
    later: string[];
    backlog: string[];
  };
  updatedAt: string; // ISO timestamp
  version: 1;
}

/**
 * Get all stored layouts from localStorage
 */
function getAllLayouts(): Record<string, FocusLayout> {
  if (typeof window === "undefined") return {};

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return {};

    const layouts = JSON.parse(stored);
    return typeof layouts === "object" ? layouts : {};
  } catch (error) {
    console.error("Error reading focus layouts:", error);
    return {};
  }
}

/**
 * Save all layouts to localStorage
 */
function saveAllLayouts(layouts: Record<string, FocusLayout>): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts));
  } catch (error) {
    console.error("Error saving focus layouts:", error);
  }
}

/**
 * Get layout for a specific date
 */
export async function getLayout(date: string): Promise<FocusLayout | null> {
  const layouts = getAllLayouts();
  return layouts[date] || null;
}

/**
 * Save a layout for a specific date
 */
export async function saveLayout(layout: FocusLayout): Promise<void> {
  const layouts = getAllLayouts();
  layouts[layout.date] = layout;
  saveAllLayouts(layouts);
}

/**
 * Upsert a layout by mutating its lists
 * Convenience method for updating bucket contents
 */
export async function upsertLayout(
  date: string,
  mutate: (lists: FocusLayout["lists"]) => void
): Promise<void> {
  const existing = await getLayout(date);

  const layout: FocusLayout = existing || {
    date,
    lists: {
      now: [],
      next: [],
      later: [],
      backlog: [],
    },
    updatedAt: new Date().toISOString(),
    version: 1,
  };

  // Apply mutation
  mutate(layout.lists);

  // Update timestamp
  layout.updatedAt = new Date().toISOString();

  // Save
  await saveLayout(layout);
}

/**
 * Delete layout for a specific date
 */
export async function deleteLayout(date: string): Promise<void> {
  const layouts = getAllLayouts();
  delete layouts[date];
  saveAllLayouts(layouts);
}

/**
 * Clear all focus layouts
 */
export async function clearAllLayouts(): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error("Error clearing focus layouts:", error);
  }
}
