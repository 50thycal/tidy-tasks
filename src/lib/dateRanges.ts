import type { WorkSettingsV1 } from "@/src/types";

/**
 * Get start and end of today in ISO format
 */
export function todayRange(now: Date, timezone: string, endOfDay: string): [string, string] {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const dateStr = `${year}-${month}-${day}`;

  // Start of day (00:00)
  const startISO = `${dateStr}T00:00:00`;

  // End of day from settings
  const endISO = `${dateStr}T${endOfDay}:00`;

  return [startISO, endISO];
}

/**
 * Get start and end of this week (Monday to end-of-week anchor)
 */
export function thisWeekRange(now: Date, settings: WorkSettingsV1): [string, string] {
  const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.

  // Find Monday of this week
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // If Sunday, go back 6 days
  const monday = new Date(now);
  monday.setDate(monday.getDate() - daysToMonday);

  // Format Monday as YYYY-MM-DD
  const startStr = formatDate(monday);
  const startISO = `${startStr}T00:00:00`;

  // Find end-of-week anchor day for THIS week
  // We need the anchor day that falls between Monday and Sunday of the current week.
  // Use Monday as the reference point to avoid the weekend look-forward bug.
  const anchorDayNum = dayOfWeekToNumber(settings.eowAnchor);
  const mondayDayNum = monday.getDay(); // Should be 1 (Monday)
  let daysFromMondayToAnchor = (anchorDayNum - mondayDayNum + 7) % 7;

  const anchorDate = new Date(monday);
  anchorDate.setDate(anchorDate.getDate() + daysFromMondayToAnchor);

  const endStr = formatDate(anchorDate);
  const endISO = `${endStr}T${settings.endOfDay}:00`;

  return [startISO, endISO];
}

/**
 * Get start and end of next week (next Monday to next end-of-week anchor)
 */
export function nextWeekRange(now: Date, settings: WorkSettingsV1): [string, string] {
  const dayOfWeek = now.getDay();

  // Find next Monday
  const daysToNextMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
  const nextMonday = new Date(now);
  nextMonday.setDate(nextMonday.getDate() + daysToNextMonday);

  const startStr = formatDate(nextMonday);
  const startISO = `${startStr}T00:00:00`;

  // Find next week's anchor day
  const anchorDayNum = dayOfWeekToNumber(settings.eowAnchor);
  const nextMondayDayNum = nextMonday.getDay();
  const daysToAnchor = (anchorDayNum - nextMondayDayNum + 7) % 7;

  const anchorDate = new Date(nextMonday);
  anchorDate.setDate(anchorDate.getDate() + daysToAnchor);

  const endStr = formatDate(anchorDate);
  const endISO = `${endStr}T${settings.endOfDay}:00`;

  return [startISO, endISO];
}

/**
 * Check if date is overdue (before now)
 */
export function isOverdue(dueAt: string | null, now: Date): boolean {
  if (!dueAt) return false;

  const dueDate = new Date(dueAt);
  return dueDate < now;
}

/**
 * Check if date is in range (inclusive)
 */
export function isInRange(dueAt: string | null, start: string, end: string): boolean {
  if (!dueAt) return false;

  const dueDate = new Date(dueAt);
  const startDate = new Date(start);
  const endDate = new Date(end);

  return dueDate >= startDate && dueDate <= endDate;
}

/**
 * Helper: Format date as YYYY-MM-DD
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Helper: Convert day of week name to number (0 = Sunday, 6 = Saturday)
 */
function dayOfWeekToNumber(day: string): number {
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[day] || 1; // Default to Monday
}
