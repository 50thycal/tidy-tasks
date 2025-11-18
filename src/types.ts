// Convenience re-exports from /types/api.d.ts
export type {
  Task,
  TaskStatus,
  PriorityBucket,
  EnergyLevel,
  CleanTaskRequest,
  CleanTaskResponse,
  PrioritizeRequest,
  PrioritizeResponse,
  PrioritizedItem,
  CalendarWindow,
  PrioritizeTaskInput,
  FocusQueueSummary,
  WeeklySummaryRequest,
  WeeklySummaryResponse,
  WeeklySummaryTask,
  TidyApiClient,
} from "@/types/api";

export { createTidyApiClient } from "@/types/api";

// Work Context Settings
export type DayOfWeek = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

// US timezone helpers
export type USZoneKey = 'Pacific' | 'Mountain' | 'Central' | 'Eastern';
export const US_TZ: Record<USZoneKey, string> = {
  Pacific: 'America/Los_Angeles',
  Mountain: 'America/Denver',
  Central: 'America/Chicago',
  Eastern: 'America/New_York',
};

// Project metadata for v2
export interface ProjectMeta {
  id: string;            // ulid/uuid
  name: string;
  llmr_due?: string | null; // ISO date or null
  ifr_due?: string | null;
  ifc_due?: string | null;
  notes?: string;
  updated_at: string;
}

// V1 Settings (for migration)
export interface WorkSettingsV1 {
  timezone: string; // IANA timezone, e.g., "America/Phoenix"
  workDays: DayOfWeek[]; // Default: Mon-Fri
  endOfDay: string; // "HH:MM" in 24h format, default "17:00"
  eowAnchor: DayOfWeek; // End-of-week anchor day, default "Fri"
  eowRollover: "same-week" | "next-workweek-if-past-eod"; // Default: next-workweek-if-past-eod
  projects?: Array<{
    name: string;
    priority?: number;
    deadline?: string | null;
  }>;
  notifications?: {
    enabled: boolean;
    digestTime: string; // HH:MM format
    lastDigestDate?: string; // YYYY-MM-DD
  };
}

export interface TidySettingsDocV1 {
  version: 1;
  work: WorkSettingsV1;
}

// Privacy Settings for AI redaction
export interface PrivacySettings {
  enabled: boolean; // default: false
  redactionMode: "none" | "emails_phones" | "emails_phones_names";
}

// V2 Settings (current)
export interface WorkSettingsV2 {
  version: 2;
  timezone: string;     // IANA
  work_days: ('mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun')[];
  end_of_day: string;   // "HH:MM"
  eow_anchor: DayOfWeek; // Keep for compatibility with existing logic
  // removed: rollover
  role?: {
    title?: string;     // "Project Manager"
    context?: string;   // free text
  };
  projects?: ProjectMeta[];
  work_context?: string; // free text
  notifications?: {
    enabled: boolean;
    digestTime: string;
    lastDigestDate?: string;
  };
  privacy?: PrivacySettings;
}

export interface TidySettingsDocV2 {
  version: 2;
  work: WorkSettingsV2;
}

// Union type for compatibility
export type WorkSettings = WorkSettingsV1 | WorkSettingsV2;
export type TidySettingsDoc = TidySettingsDocV1 | TidySettingsDocV2;

