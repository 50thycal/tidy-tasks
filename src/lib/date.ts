/**
 * Convert separate date and time strings to ISO 8601 with timezone
 * @param dateStr - Date in YYYY-MM-DD format
 * @param timeStr - Time in HH:MM format (24-hour)
 * @param tz - IANA timezone (e.g., "America/Phoenix")
 * @returns ISO 8601 string or null if either input is missing
 */
export function toIsoFromDateTime(
  dateStr: string | null,
  timeStr: string | null,
  tz: string
): string | null {
  if (!dateStr || !timeStr) return null;

  try {
    // Combine date and time
    const combined = `${dateStr}T${timeStr}:00`;

    // Create a date object
    const date = new Date(combined);

    // Check if valid
    if (isNaN(date.getTime())) return null;

    // Format to ISO with timezone offset
    // We'll use toLocaleString to get the timezone-aware representation
    const isoString = date.toISOString();

    return isoString;
  } catch (error) {
    console.error("Error converting date/time to ISO:", error);
    return null;
  }
}

/**
 * Split an ISO 8601 string into separate date and time components
 * @param iso - ISO 8601 string
 * @returns Object with date (YYYY-MM-DD) and time (HH:MM) strings
 */
export function splitIso(iso?: string | null): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };

  try {
    const date = new Date(iso);
    if (isNaN(date.getTime())) return { date: "", time: "" };

    // Extract date part (YYYY-MM-DD)
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const dateStr = `${year}-${month}-${day}`;

    // Extract time part (HH:MM in 24-hour format)
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const timeStr = `${hours}:${minutes}`;

    return { date: dateStr, time: timeStr };
  } catch (error) {
    console.error("Error splitting ISO date:", error);
    return { date: "", time: "" };
  }
}

/**
 * Format an ISO 8601 string for friendly display
 * @param iso - ISO 8601 string
 * @param tz - IANA timezone (optional)
 * @returns Formatted date string or empty string if invalid
 */
export function formatFriendly(iso?: string | null, tz?: string): string {
  if (!iso) return "";

  try {
    const date = new Date(iso);
    if (isNaN(date.getTime())) return "";

    const options: Intl.DateTimeFormatOptions = {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    };

    if (tz) {
      options.timeZone = tz;
    }

    return date.toLocaleString("en-US", options);
  } catch (error) {
    console.error("Error formatting date:", error);
    return iso;
  }
}
