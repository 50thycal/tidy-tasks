/**
 * Focus state persistence helpers
 * Stores user's focus capacity settings in localStorage
 */

const CAPACITY_KEY = "tidy.focus.capacity";
const DEFAULT_MINUTES = 60;

export interface FocusCapacity {
  minutes: number;
  plus2h: boolean;
}

/**
 * Load focus capacity from localStorage
 * Returns default values if not found
 */
export function loadCapacity(): FocusCapacity {
  if (typeof window === "undefined") {
    return { minutes: DEFAULT_MINUTES, plus2h: false };
  }

  try {
    const stored = localStorage.getItem(CAPACITY_KEY);
    if (!stored) {
      return { minutes: DEFAULT_MINUTES, plus2h: false };
    }

    const parsed = JSON.parse(stored);
    return {
      minutes: typeof parsed.minutes === "number" ? parsed.minutes : DEFAULT_MINUTES,
      plus2h: typeof parsed.plus2h === "boolean" ? parsed.plus2h : false,
    };
  } catch (error) {
    console.error("Error loading focus capacity:", error);
    return { minutes: DEFAULT_MINUTES, plus2h: false };
  }
}

/**
 * Save focus capacity to localStorage
 */
export function saveCapacity(minutes: number, plus2h: boolean): void {
  if (typeof window === "undefined") return;

  try {
    const data: FocusCapacity = { minutes, plus2h };
    localStorage.setItem(CAPACITY_KEY, JSON.stringify(data));
  } catch (error) {
    console.error("Error saving focus capacity:", error);
  }
}

/**
 * Get the effective max_focus_minutes value
 * If plus2h is true, returns 240, otherwise returns minutes
 */
export function getEffectiveMinutes(capacity: FocusCapacity): number {
  return capacity.plus2h ? 240 : capacity.minutes;
}
