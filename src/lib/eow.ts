import type { WorkSettingsV1, DayOfWeek } from "@/src/types";
import { getTimezoneOffset } from "date-fns-tz";

/**
 * Check if a string is a plain date (YYYY-MM-DD)
 */
export function isPlainDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

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
 * Convert YYYY-MM-DD to end-of-day ISO datetime
 * @param dateYYYYMMDD - Plain date string (YYYY-MM-DD)
 * @param tz - IANA timezone identifier (not fully implemented, uses local offset)
 * @param endOfDayHHMM - Time in HH:MM format (e.g., "17:00")
 * @returns ISO datetime string with timezone offset
 */
export function toEndOfDayIso(
  dateYYYYMMDD: string,
  tz: string,
  endOfDayHHMM: string = "17:00"
): string {
  try {
    const [hours, minutes] = endOfDayHHMM.split(":").map(Number);
    const hh = hours.toString().padStart(2, "0");
    const mm = minutes.toString().padStart(2, "0");

    // Use date-fns-tz to get the real offset for the given IANA timezone
    const approxDate = new Date(`${dateYYYYMMDD}T${hh}:${mm}:00Z`);
    const offsetMs = getTimezoneOffset(tz, approxDate);
    const totalMinutes = offsetMs / 60_000;
    const offsetSign = totalMinutes >= 0 ? "+" : "-";
    const absMinutes = Math.abs(totalMinutes);
    const offsetHours = Math.floor(absMinutes / 60);
    const offsetMins = absMinutes % 60;
    const offsetString = `${offsetSign}${String(offsetHours).padStart(2, "0")}:${String(offsetMins).padStart(2, "0")}`;

    return `${dateYYYYMMDD}T${hh}:${mm}:00${offsetString}`;
  } catch (error) {
    console.error("Error converting date:", error);
    throw error;
  }
}

/**
 * Calculate end-of-week datetime based on work settings
 * @param now - Current date/time
 * @param work - Work settings
 * @returns ISO datetime string for end of week
 */
export function endOfWeek(now: Date, work: WorkSettingsV1): string {
  const { eowAnchor, endOfDay, eowRollover } = work;

  const anchorDay = DAY_MAP[eowAnchor];
  const currentDay = now.getDay();

  // Parse end-of-day time
  const [eodHours, eodMinutes] = endOfDay.split(":").map(Number);

  // Check if we're past EOD today
  const currentHours = now.getHours();
  const currentMinutes = now.getMinutes();
  const isPastEOD = currentHours > eodHours || (currentHours === eodHours && currentMinutes >= eodMinutes);

  // Calculate days until anchor day
  let daysUntilAnchor = (anchorDay - currentDay + 7) % 7;

  // If today is the anchor day
  if (daysUntilAnchor === 0) {
    if (eowRollover === "next-workweek-if-past-eod" && isPastEOD) {
      // If we're past EOD on the anchor day, jump to next week
      daysUntilAnchor = 7;
    }
    // Otherwise, use today (same-week mode or before EOD)
  }

  // Calculate the target date
  const targetDate = new Date(now);
  targetDate.setDate(targetDate.getDate() + daysUntilAnchor);

  // Format as YYYY-MM-DD
  const year = targetDate.getFullYear();
  const month = String(targetDate.getMonth() + 1).padStart(2, "0");
  const day = String(targetDate.getDate()).padStart(2, "0");
  const dateStr = `${year}-${month}-${day}`;

  // Convert to end-of-day ISO
  return toEndOfDayIso(dateStr, work.timezone, endOfDay);
}

/**
 * Check if text contains "end of week" phrase (this week)
 */
export function containsEOW(text: string): boolean {
  // Match "end of week" or "end of the week" but NOT "end of next week"
  return /(end of (the )?week|EOW(?!\s+next)|eow(?!\s+next))/i.test(text) &&
         !containsEONW(text);
}

/**
 * Check if text contains "end of next week" phrase
 */
export function containsEONW(text: string): boolean {
  return /(end of next week|EONW|eonw)/i.test(text);
}

/**
 * Calculate end of NEXT week datetime based on work settings
 * @param now - Current date/time
 * @param work - Work settings
 * @returns ISO datetime string for end of next week
 */
export function endOfNextWeek(now: Date, work: WorkSettingsV1): string {
  const { eowAnchor, endOfDay } = work;

  const anchorDay = DAY_MAP[eowAnchor];
  const currentDay = now.getDay();

  // Calculate days until anchor day this week
  let daysUntilAnchor = (anchorDay - currentDay + 7) % 7;

  // Add 7 to get next week's anchor day
  // When daysUntilAnchor is 0 (today is anchor day), +7 gives next week's anchor
  // When daysUntilAnchor > 0, +7 gives next week's occurrence
  daysUntilAnchor += 7;

  // Calculate the target date
  const targetDate = new Date(now);
  targetDate.setDate(targetDate.getDate() + daysUntilAnchor);

  // Format as YYYY-MM-DD
  const year = targetDate.getFullYear();
  const month = String(targetDate.getMonth() + 1).padStart(2, "0");
  const day = String(targetDate.getDate()).padStart(2, "0");
  const dateStr = `${year}-${month}-${day}`;

  // Convert to end-of-day ISO
  return toEndOfDayIso(dateStr, work.timezone, endOfDay);
}
