import type { WorkSettingsV1, DayOfWeek } from "@/src/types";

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
    const date = new Date(`${dateYYYYMMDD}T${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:00`);

    // Get timezone offset
    const offset = date.getTimezoneOffset();
    const offsetHours = Math.floor(Math.abs(offset) / 60);
    const offsetMinutes = Math.abs(offset) % 60;
    const offsetSign = offset <= 0 ? "+" : "-";
    const offsetString = `${offsetSign}${String(offsetHours).padStart(2, "0")}:${String(offsetMinutes).padStart(2, "0")}`;

    return `${dateYYYYMMDD}T${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:00${offsetString}`;
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
  const { eowAnchor, endOfDay, eowRollover, workDays } = work;

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
 * Check if text contains "end of week" phrase
 */
export function containsEOW(text: string): boolean {
  return /(end of (the )?week|EOW|eow)/i.test(text);
}
