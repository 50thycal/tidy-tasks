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

export interface WorkSettings {
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

export interface TidySettingsDoc {
  version: 1;
  work: WorkSettings;
}
