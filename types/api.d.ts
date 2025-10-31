// /types/api.d.ts

// ---------- Core Types ----------
export type TaskStatus = "inbox" | "active" | "done" | "snoozed";
export type PriorityBucket = "now" | "next" | "later" | "backlog";
export type EnergyLevel = "low" | "med" | "high";

// Matches schema/task.json (storage form)
export interface Task {
  id: string;                // UUID
  title: string;             // verb-first
  notes?: string;
  status: TaskStatus;

  priority_score?: number;   // 0–100
  bucket?: PriorityBucket;

  importance?: number;       // 0–100
  effort_min?: 5 | 15 | 30 | 60 | 120;
  energy?: EnergyLevel;

  due_at?: string | null;          // ISO 8601
  scheduled_for?: string | null;   // ISO 8601

  project?: string | null;
  tags?: string[];
  subtasks?: string[];
  dependencies?: string[];
  blocked?: boolean;

  created_at: string;        // ISO 8601
  updated_at: string;        // ISO 8601
}

// ---------- Clean Task ----------
export interface CleanTaskRequest {
  raw_text: string;
  today?: string;       // YYYY-MM-DD
  timezone?: string;    // IANA TZ, e.g., "America/Phoenix"
  redaction?: {
    enabled: boolean;
    entities?: Array<"emails" | "phones" | "proper_names">;
  };
}

export interface CleanTaskResponse {
  title: string;
  due_at: string | null;        // ISO 8601 or null
  scheduled_for?: string | null;
  effort_min: 5 | 15 | 30 | 60 | 120;
  energy: EnergyLevel;
  tags: string[];
  project: string | null;
  subtasks: string[];
  importance: number;           // 0–100
  notes_append?: string;
}

// ---------- Prioritize ----------
export interface CalendarWindow {
  start: string;  // ISO 8601
  end: string;    // ISO 8601
  type?: "free" | "busy";
}

export interface PrioritizeTaskInput {
  id: string;
  title: string;
  status: TaskStatus;
  importance?: number;
  effort_min?: 5 | 15 | 30 | 60 | 120;
  energy?: EnergyLevel;
  due_at?: string | null;
  scheduled_for?: string | null;
  project?: string | null;
  tags?: string[];
}

export interface PrioritizeRequest {
  date: string;               // YYYY-MM-DD
  timezone?: string;          // IANA TZ
  energy?: EnergyLevel;       // optional user state for the day
  max_focus_minutes?: number; // default 240 (4h)
  calendar_windows?: CalendarWindow[];
  tasks: PrioritizeTaskInput[];
}

export interface PrioritizedItem {
  id: string;
  priority_score: number;     // 0–100
  bucket: "Now" | "Next" | "Later" | "Backlog"; // TitleCase from model
  rationale: string;
}

export type PrioritizeResponse = PrioritizedItem[];

export interface FocusQueueSummary {
  planned_minutes_now: number;
  remaining_capacity_minutes: number;
  alternates?: string[]; // task ids
}

// ---------- Minimal Client (optional) ----------
export interface TidyApiClient {
  cleanTask(req: CleanTaskRequest, opts?: RequestInit): Promise<CleanTaskResponse>;
  prioritizeTasks(req: PrioritizeRequest, opts?: RequestInit): Promise<PrioritizeResponse>;
}

export function createTidyApiClient(baseUrl = ""): TidyApiClient {
  const post = async <T>(path: string, body: unknown, opts?: RequestInit): Promise<T> => {
    const res = await fetch(baseUrl + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-No-Train": "true", ...(opts?.headers || {}) },
      body: JSON.stringify(body),
      ...opts
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    return (await res.json()) as T;
  };
  return {
    cleanTask: (req, opts) => post<CleanTaskResponse>("/api/ai/clean_task", req, opts),
    prioritizeTasks: (req, opts) => post<PrioritizeResponse>("/api/ai/prioritize_tasks", req, opts)
  };
}
