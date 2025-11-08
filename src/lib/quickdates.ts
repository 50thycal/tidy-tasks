import type { WorkSettingsV1, DayOfWeek } from "@/src/types";
import { toEndOfDayIso } from "@/src/lib/eow";

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
 * Format a Date object as YYYY-MM-DD
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Get today's date at end of day in ISO format
 */
export function todayISO(endOfDay: string, timezone: string): string {
  const today = new Date();
  const dateStr = formatDate(today);
  return toEndOfDayIso(dateStr, timezone, endOfDay);
}

/**
 * Get tomorrow's date at end of day in ISO format
 */
export function tomorrowISO(endOfDay: string, timezone: string): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateStr = formatDate(tomorrow);
  return toEndOfDayIso(dateStr, timezone, endOfDay);
}

/**
 * Get the next occurrence of the end-of-week anchor day at end of day
 * @param endOfDay - Time in HH:MM format (e.g., "17:00")
 * @param timezone - IANA timezone
 * @param anchorDay - Day of week anchor (e.g., "Fri")
 * @param rollover - Rollover behavior
 */
export function nextAnchorISO(
  endOfDay: string,
  timezone: string,
  anchorDay: DayOfWeek,
  rollover: "same-week" | "next-workweek-if-past-eod" = "next-workweek-if-past-eod"
): string {
  const now = new Date();
  const targetDayNum = DAY_MAP[anchorDay];
  const currentDayNum = now.getDay();

  // Parse end-of-day time
  const [eodHours, eodMinutes] = endOfDay.split(":").map(Number);

  // Check if we're past EOD today
  const currentHours = now.getHours();
  const currentMinutes = now.getMinutes();
  const isPastEOD = currentHours > eodHours || (currentHours === eodHours && currentMinutes >= eodMinutes);

  // Calculate days until anchor day
  let daysUntilAnchor = (targetDayNum - currentDayNum + 7) % 7;

  // If today is the anchor day
  if (daysUntilAnchor === 0) {
    if (rollover === "next-workweek-if-past-eod" && isPastEOD) {
      // If we're past EOD on the anchor day, jump to next week
      daysUntilAnchor = 7;
    } else if (rollover === "same-week") {
      // For same-week mode, if it's 0, use today
      daysUntilAnchor = 0;
    }
  }

  // If daysUntilAnchor is still 0 but we haven't handled it, default to next week
  if (daysUntilAnchor === 0 && rollover === "next-workweek-if-past-eod") {
    daysUntilAnchor = 7;
  }

  const targetDate = new Date(now);
  targetDate.setDate(targetDate.getDate() + daysUntilAnchor);

  const dateStr = formatDate(targetDate);
  return toEndOfDayIso(dateStr, timezone, endOfDay);
}

/**
 * Get next week's anchor day (anchor + 7 days) at end of day
 */
export function nextWeekISO(
  endOfDay: string,
  timezone: string,
  anchorDay: DayOfWeek,
  rollover: "same-week" | "next-workweek-if-past-eod" = "next-workweek-if-past-eod"
): string {
  // First get the next anchor
  const nextAnchor = nextAnchorISO(endOfDay, timezone, anchorDay, rollover);

  // Parse the date and add 7 days
  const anchorDate = new Date(nextAnchor);
  anchorDate.setDate(anchorDate.getDate() + 7);

  const dateStr = formatDate(anchorDate);
  return toEndOfDayIso(dateStr, timezone, endOfDay);
}

/**
 * Add days to a date (or today if null) and return ISO at end of day
 * @param currentDueAt - Current due_at ISO string or null
 * @param daysToAdd - Number of days to add
 * @param endOfDay - Time in HH:MM format
 * @param timezone - IANA timezone
 */
export function addDaysISO(
  currentDueAt: string | null,
  daysToAdd: number,
  endOfDay: string,
  timezone: string
): string {
  let baseDate: Date;

  if (currentDueAt) {
    baseDate = new Date(currentDueAt);
  } else {
    baseDate = new Date();
  }

  baseDate.setDate(baseDate.getDate() + daysToAdd);
  const dateStr = formatDate(baseDate);
  return toEndOfDayIso(dateStr, timezone, endOfDay);
}

/**
 * Clear due date (returns null)
 */
export function clearDueDate(): null {
  return null;
}

/**
 * Get all quick date options for a task
 */
export function getQuickDateActions(settings: WorkSettingsV1, currentDueAt: string | null) {
  return {
    today: () => todayISO(settings.endOfDay, settings.timezone),
    tomorrow: () => tomorrowISO(settings.endOfDay, settings.timezone),
    nextFriday: () => nextAnchorISO(settings.endOfDay, settings.timezone, settings.eowAnchor, settings.eowRollover),
    nextWeek: () => nextWeekISO(settings.endOfDay, settings.timezone, settings.eowAnchor, settings.eowRollover),
    plusOneWeek: () => addDaysISO(currentDueAt, 7, settings.endOfDay, settings.timezone),
    plusTwoWeeks: () => addDaysISO(currentDueAt, 14, settings.endOfDay, settings.timezone),
    clear: () => clearDueDate(),
  };
}
