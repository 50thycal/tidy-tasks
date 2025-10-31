import type { WorkSettings, TidySettingsDoc, DayOfWeek } from "@/src/types";

const STORAGE_KEY = "tidy.settings";

/**
 * Default work settings
 */
export function getDefaultWorkSettings(): WorkSettings {
  return {
    timezone: process.env.TZ || "America/Phoenix",
    workDays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
    endOfDay: "17:00",
    eowAnchor: "Fri",
    eowRollover: "next-workweek-if-past-eod",
    projects: [],
  };
}

/**
 * Get settings from localStorage (browser only)
 */
export function getStoredSettings(): TidySettingsDoc | null {
  if (typeof window === "undefined") return null;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    const parsed = JSON.parse(stored) as TidySettingsDoc;
    if (parsed.version === 1) {
      return parsed;
    }
    return null;
  } catch (error) {
    console.error("Error reading settings:", error);
    return null;
  }
}

/**
 * Save settings to localStorage (browser only)
 */
export function saveSettings(settings: TidySettingsDoc): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error("Error saving settings:", error);
  }
}

/**
 * Get work settings with fallback to defaults
 */
export function getWorkSettings(): WorkSettings {
  const stored = getStoredSettings();
  if (stored?.work) {
    // Merge with defaults to ensure all required fields exist
    return {
      ...getDefaultWorkSettings(),
      ...stored.work,
    };
  }
  return getDefaultWorkSettings();
}

/**
 * Extract settings from request body or use defaults (server-side)
 */
export function getSettingsFromRequest(reqBody: any): WorkSettings {
  const defaults = getDefaultWorkSettings();

  if (!reqBody?.settings) {
    return defaults;
  }

  // Best-effort merge with defaults
  try {
    const provided = reqBody.settings;
    return {
      timezone: provided.timezone || defaults.timezone,
      workDays: Array.isArray(provided.workDays) && provided.workDays.length > 0
        ? provided.workDays
        : defaults.workDays,
      endOfDay: provided.endOfDay || defaults.endOfDay,
      eowAnchor: provided.eowAnchor || defaults.eowAnchor,
      eowRollover: provided.eowRollover || defaults.eowRollover,
      projects: Array.isArray(provided.projects) ? provided.projects : defaults.projects,
    };
  } catch (error) {
    console.error("Error parsing settings from request:", error);
    return defaults;
  }
}

/**
 * Reset settings to defaults (browser only)
 */
export function resetSettings(): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error("Error resetting settings:", error);
  }
}
