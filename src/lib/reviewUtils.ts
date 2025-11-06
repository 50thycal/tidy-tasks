import type { DayOfWeek } from "@/src/types";

/**
 * Map day of week names to JS Date day numbers (0 = Sunday, 6 = Saturday)
 */
const DAY_MAP: Record<DayOfWeek, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/**
 * Get start of week (00:00:00 on the anchor day)
 * @param now - Current date
 * @param anchor - Day of week to use as start (default: Mon)
 * @returns Date object for start of week
 */
export function startOfWeek(now: Date, anchor: DayOfWeek = "Mon"): Date {
  const anchorDay = DAY_MAP[anchor];
  const currentDay = now.getDay();

  // Calculate days since the last anchor day
  let daysSinceAnchor = (currentDay - anchorDay + 7) % 7;

  const start = new Date(now);
  start.setDate(start.getDate() - daysSinceAnchor);
  start.setHours(0, 0, 0, 0);

  return start;
}

/**
 * Get end of week (23:59:59 on the last day of the week)
 * @param now - Current date
 * @param anchor - Day of week to use as start (default: Mon)
 * @returns Date object for end of week
 */
export function endOfWeekDate(now: Date, anchor: DayOfWeek = "Mon"): Date {
  const start = startOfWeek(now, anchor);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return end;
}

/**
 * Format week range for display
 * @param now - Current date
 * @param anchor - Day of week to use as start
 * @returns String like "Nov 3–9" or "Dec 30 – Jan 5"
 */
export function formatWeekRange(now: Date, anchor: DayOfWeek = "Mon"): string {
  const start = startOfWeek(now, anchor);
  const end = endOfWeekDate(now, anchor);

  const startMonth = start.toLocaleDateString("en-US", { month: "short" });
  const endMonth = end.toLocaleDateString("en-US", { month: "short" });
  const startDay = start.getDate();
  const endDay = end.getDate();

  if (startMonth === endMonth) {
    return `${startMonth} ${startDay}–${endDay}`;
  } else {
    return `${startMonth} ${startDay} – ${endMonth} ${endDay}`;
  }
}

/**
 * Check if an ISO date string is in the past
 * @param isoDate - ISO 8601 date string
 * @returns true if the date is in the past
 */
export function isPast(isoDate: string | null | undefined): boolean {
  if (!isoDate) return false;

  try {
    const date = new Date(isoDate);
    const now = new Date();
    return date < now;
  } catch {
    return false;
  }
}

/**
 * Check if an ISO date string is within this week
 * @param isoDate - ISO 8601 date string
 * @param now - Current date
 * @param anchor - Day of week to use as start
 * @returns true if the date is within this week
 */
export function isThisWeek(
  isoDate: string | null | undefined,
  now: Date,
  anchor: DayOfWeek = "Mon"
): boolean {
  if (!isoDate) return false;

  try {
    const date = new Date(isoDate);
    const start = startOfWeek(now, anchor);
    const end = endOfWeekDate(now, anchor);

    return date >= start && date <= end;
  } catch {
    return false;
  }
}

/**
 * Check if an item is stale (not touched in N days)
 * @param touchedAt - ISO timestamp of last touch
 * @param createdAt - ISO timestamp of creation (fallback)
 * @param days - Number of days to consider stale (default: 7)
 * @returns true if the item is stale
 */
export function isStale(
  touchedAt: string | null | undefined,
  createdAt: string,
  days: number = 7
): boolean {
  try {
    const lastTouch = new Date(touchedAt || createdAt);
    const now = new Date();
    const daysSinceTouch = (now.getTime() - lastTouch.getTime()) / (1000 * 60 * 60 * 24);

    return daysSinceTouch >= days;
  } catch {
    return false;
  }
}

/**
 * Format a date for friendly display
 * @param isoDate - ISO 8601 date string
 * @returns Formatted string like "Nov 3" or "Today"
 */
export function formatFriendlyDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "–";

  try {
    const date = new Date(isoDate);
    const now = new Date();

    // Check if today
    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    if (isToday) {
      return "Today";
    }

    // Check if tomorrow
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow =
      date.getDate() === tomorrow.getDate() &&
      date.getMonth() === tomorrow.getMonth() &&
      date.getFullYear() === tomorrow.getFullYear();

    if (isTomorrow) {
      return "Tomorrow";
    }

    // Format as "Nov 3"
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "–";
  }
}
