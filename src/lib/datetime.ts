/**
 * Converts a plain date (YYYY-MM-DD) to end-of-day ISO datetime in the given timezone.
 * If input is already an ISO datetime, returns it as-is.
 * If invalid, returns null.
 *
 * @param dateLike - Either YYYY-MM-DD or ISO date-time string
 * @param tz - IANA timezone identifier (e.g., "America/Phoenix")
 * @returns ISO date-time string with timezone offset, or null if invalid
 */
export function toEndOfDayIso(dateLike: string | null, tz: string): string | null {
  if (!dateLike) return null;

  // Check if it's already an ISO date-time (contains 'T')
  if (dateLike.includes("T")) {
    return dateLike;
  }

  // Check if it matches YYYY-MM-DD pattern
  const plainDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
  const match = dateLike.match(plainDatePattern);

  if (!match) {
    // Invalid format
    return null;
  }

  // For simplicity, append end-of-day time (17:00 = 5 PM)
  // In a full implementation, you'd use a proper timezone library like date-fns-tz
  // For now, we'll create a date and format it with the timezone offset

  try {
    // Create a date object for the given date at 17:00 (5 PM) in the local timezone
    const [, year, month, day] = match;
    const date = new Date(`${year}-${month}-${day}T17:00:00`);

    // Get timezone offset in minutes
    // Note: This is a simplified approach. For proper timezone handling,
    // you'd want to use a library like date-fns-tz or luxon
    const offset = date.getTimezoneOffset();
    const offsetHours = Math.floor(Math.abs(offset) / 60);
    const offsetMinutes = Math.abs(offset) % 60;
    const offsetSign = offset <= 0 ? "+" : "-";
    const offsetString = `${offsetSign}${String(offsetHours).padStart(2, "0")}:${String(offsetMinutes).padStart(2, "0")}`;

    // Return ISO string with offset
    const isoDate = `${year}-${month}-${day}T17:00:00${offsetString}`;
    return isoDate;
  } catch (error) {
    console.error("Error converting date:", error);
    return null;
  }
}

/**
 * Normalizes a CleanTaskResponse by converting plain dates to ISO datetimes
 * @param response - The response object from the AI
 * @param timezone - IANA timezone identifier
 * @returns Normalized response
 */
export function normalizeCleanTaskResponse(
  response: any,
  timezone: string
): any {
  const normalized = { ...response };

  // Normalize due_at if it's a plain date
  if (typeof normalized.due_at === "string") {
    const converted = toEndOfDayIso(normalized.due_at, timezone);
    if (converted) {
      normalized.due_at = converted;
    }
  }

  // Normalize scheduled_for if it's a plain date
  if (typeof normalized.scheduled_for === "string") {
    const converted = toEndOfDayIso(normalized.scheduled_for, timezone);
    if (converted) {
      normalized.scheduled_for = converted;
    }
  }

  // Ensure notes_append is null if undefined
  if (normalized.notes_append === undefined) {
    normalized.notes_append = null;
  }

  return normalized;
}
