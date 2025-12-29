import type { WorkSettingsV1, WorkSettingsV2, TidySettingsDocV1, TidySettingsDocV2, TidySettingsDoc, DayOfWeek, ProjectMeta } from "@/src/types";

const STORAGE_KEY = "tidy.settings";

/**
 * Default v2 work settings
 */
export function getDefaultWorkSettingsV2(): WorkSettingsV2 {
  return {
    version: 2,
    timezone: process.env.TZ || "America/Los_Angeles",
    work_days: ["mon", "tue", "wed", "thu", "fri"],
    end_of_day: "17:00",
    eow_anchor: "Fri",
    role: undefined,
    projects: [],
    work_context: undefined,
    notifications: undefined,
  };
}

/**
 * Migrate v1 settings to v2
 */
function migrateV1ToV2(v1: TidySettingsDocV1): TidySettingsDocV2 {
  const v1Work = v1.work;

  // Map v1 workDays (capitalized) to v2 work_days (lowercase)
  const work_days = (v1Work.workDays || ["Mon", "Tue", "Wed", "Thu", "Fri"]).map(
    day => day.toLowerCase() as 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
  );

  // Try to migrate old projects format to new ProjectMeta format
  const projects: ProjectMeta[] = [];
  if (Array.isArray(v1Work.projects)) {
    for (const oldProj of v1Work.projects) {
      if (oldProj.name) {
        projects.push({
          id: crypto.randomUUID(),
          name: oldProj.name,
          llmr_due: null,
          ifr_due: null,
          ifc_due: null,
          notes: oldProj.deadline ? `Deadline: ${oldProj.deadline}` : undefined,
          updated_at: new Date().toISOString(),
        });
      }
    }
  }

  const v2Work: WorkSettingsV2 = {
    version: 2,
    timezone: v1Work.timezone || "America/Los_Angeles",
    work_days,
    end_of_day: v1Work.endOfDay || "17:00",
    eow_anchor: v1Work.eowAnchor || "Fri",
    // Drop rollover
    role: undefined,
    projects: projects.length > 0 ? projects : undefined,
    work_context: undefined,
    notifications: v1Work.notifications,
  };

  return {
    version: 2,
    work: v2Work,
  };
}

/**
 * Get settings from localStorage (browser only) - always returns v2
 */
export function getStoredSettings(): TidySettingsDocV2 | null {
  if (typeof window === "undefined") return null;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    const parsed = JSON.parse(stored);

    // If it's already v2, return it
    if (parsed.version === 2) {
      return parsed as TidySettingsDocV2;
    }

    // If it's v1, migrate it to v2, save, and return
    if (parsed.version === 1) {
      const migrated = migrateV1ToV2(parsed as TidySettingsDocV1);
      // Save the migrated version
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      console.log("Migrated settings from v1 to v2");
      return migrated;
    }

    // Unknown version
    return null;
  } catch (error) {
    console.error("Error reading settings:", error);
    return null;
  }
}

/**
 * Save settings to localStorage (browser only)
 * Accepts both v1 and v2, auto-converts v1 to v2
 */
export function saveSettings(settings: TidySettingsDoc): void {
  if (typeof window === "undefined") return;

  try {
    // If it's v1, convert to v2 first
    const toSave = settings.version === 1
      ? migrateV1ToV2(settings as TidySettingsDocV1)
      : settings;

    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch (error) {
    console.error("Error saving settings:", error);
  }
}

/**
 * Get work settings v2 (internal use)
 */
export function getWorkSettingsV2(): WorkSettingsV2 {
  const stored = getStoredSettings();
  if (stored?.work) {
    // Merge with defaults to ensure all required fields exist
    return {
      ...getDefaultWorkSettingsV2(),
      ...stored.work,
    };
  }
  return getDefaultWorkSettingsV2();
}

/**
 * Get work settings - returns v1-compatible format for backward compatibility
 * Existing code expects v1 field names, so we convert v2 to v1 format
 */
export function getWorkSettings(): WorkSettingsV1 {
  const v2 = getWorkSettingsV2();

  // Map v2 work_days back to v1 workDays (capitalized)
  const workDays = v2.work_days.map(day => {
    return day.charAt(0).toUpperCase() + day.slice(1) as DayOfWeek;
  });

  return {
    timezone: v2.timezone,
    workDays,
    endOfDay: v2.end_of_day,
    eowAnchor: v2.eow_anchor,
    eowRollover: "next-workweek-if-past-eod", // Default for compatibility
    projects: v2.projects?.map(p => ({
      name: p.name,
      priority: undefined,
      deadline: p.llmr_due || p.ifr_due || p.ifc_due || null,
    })),
    notifications: v2.notifications,
  };
}

/**
 * Extract settings from request body or use defaults (server-side)
 * Returns v1-compatible format for existing API code
 */
export function getSettingsFromRequest(reqBody: any): WorkSettingsV1 {
  // If no settings provided, return v1-compat defaults
  if (!reqBody?.settings) {
    return getWorkSettings();
  }

  // Best-effort merge - handle both v1 and v2 formats
  try {
    const provided = reqBody.settings;

    // Check if it's v2 format
    if (provided.work_days) {
      const workDays = provided.work_days.map((day: string) => {
        return day.charAt(0).toUpperCase() + day.slice(1) as DayOfWeek;
      });

      return {
        timezone: provided.timezone || "America/Los_Angeles",
        workDays,
        endOfDay: provided.end_of_day || "17:00",
        eowAnchor: provided.eow_anchor || "Fri",
        eowRollover: "next-workweek-if-past-eod",
        projects: provided.projects?.map((p: ProjectMeta) => ({
          name: p.name,
          priority: undefined,
          deadline: p.llmr_due || p.ifr_due || p.ifc_due || null,
        })),
        notifications: provided.notifications,
      };
    }

    // Otherwise treat as v1 format
    const defaults = getWorkSettings();
    return {
      timezone: provided.timezone || defaults.timezone,
      workDays: Array.isArray(provided.workDays) && provided.workDays.length > 0
        ? provided.workDays
        : defaults.workDays,
      endOfDay: provided.endOfDay || defaults.endOfDay,
      eowAnchor: provided.eowAnchor || defaults.eowAnchor,
      eowRollover: provided.eowRollover || defaults.eowRollover,
      projects: Array.isArray(provided.projects) ? provided.projects : defaults.projects,
      notifications: provided.notifications,
    };
  } catch (error) {
    console.error("Error parsing settings from request:", error);
    return getWorkSettings();
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

// Backwards compatibility: Export getDefaultWorkSettings as v1-compat
export function getDefaultWorkSettings(): WorkSettingsV1 {
  const v2 = getDefaultWorkSettingsV2();
  const workDays = v2.work_days.map(day => day.charAt(0).toUpperCase() + day.slice(1) as DayOfWeek);

  return {
    timezone: v2.timezone,
    workDays,
    endOfDay: v2.end_of_day,
    eowAnchor: v2.eow_anchor,
    eowRollover: "next-workweek-if-past-eod",
    projects: [],
    notifications: undefined,
  };
}

/**
 * Add a new project to settings (browser only)
 * Returns the created project with its ID
 */
export function addProject(project: Omit<ProjectMeta, 'id' | 'updated_at'>): ProjectMeta {
  if (typeof window === "undefined") {
    throw new Error("addProject can only be called in browser");
  }

  const stored = getStoredSettings();
  const settings = stored || { version: 2, work: getDefaultWorkSettingsV2() };

  const newProject: ProjectMeta = {
    ...project,
    id: crypto.randomUUID(),
    updated_at: new Date().toISOString(),
  };

  // Ensure projects array exists
  if (!settings.work.projects) {
    settings.work.projects = [];
  }

  // Check for duplicate name (case-insensitive)
  const exists = settings.work.projects.some(
    p => p.name.toLowerCase() === project.name.toLowerCase()
  );
  if (exists) {
    throw new Error(`Project "${project.name}" already exists`);
  }

  settings.work.projects.push(newProject);
  saveSettings(settings);

  return newProject;
}

/**
 * Get all project names as a simple array
 */
export function getProjectNames(): string[] {
  const v2 = getWorkSettingsV2();
  return v2.projects?.map(p => p.name) || [];
}
