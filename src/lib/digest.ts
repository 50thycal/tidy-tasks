/**
 * Daily digest builder for Tidy Tasks
 * Analyzes tasks and builds digest with counts and examples
 */

import type { InboxItem } from "./clientStore";
import type { WorkSettings } from "@/src/types";

export interface DigestCounts {
  overdue: number;
  dueToday: number;
  dueNext7: number;
  staleActive: number;
}

export interface DigestExample {
  id: string;
  title: string;
  due_at: string | null;
}

export interface Digest {
  ts: string; // ISO timestamp
  date: string; // YYYY-MM-DD
  label: string; // "Daily Digest — Tue Nov 11"
  counts: DigestCounts;
  examples: {
    overdue: DigestExample[];
    dueToday: DigestExample[];
  };
  text: string; // human-readable paragraph
}

/**
 * Get start of day in timezone
 */
function startOfDay(date: Date, timezone: string): Date {
  const dateStr = date.toLocaleDateString("en-CA", { timeZone: timezone }); // YYYY-MM-DD
  const startStr = `${dateStr}T00:00:00`;

  // Parse in the target timezone
  const parts = dateStr.split("-");
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);

  const localDate = new Date(year, month, day, 0, 0, 0, 0);
  return localDate;
}

/**
 * Get end of day in timezone
 */
function endOfDay(date: Date, timezone: string): Date {
  const dateStr = date.toLocaleDateString("en-CA", { timeZone: timezone }); // YYYY-MM-DD

  const parts = dateStr.split("-");
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);

  const localDate = new Date(year, month, day, 23, 59, 59, 999);
  return localDate;
}

/**
 * Check if a task is overdue
 */
function isOverdue(dueAt: string | null, now: Date): boolean {
  if (!dueAt) return false;
  const due = new Date(dueAt);
  return due < now;
}

/**
 * Check if a task is due today
 */
function isDueToday(dueAt: string | null, now: Date, timezone: string): boolean {
  if (!dueAt) return false;

  const due = new Date(dueAt);
  const todayStart = startOfDay(now, timezone);
  const todayEnd = endOfDay(now, timezone);

  return due >= todayStart && due <= todayEnd;
}

/**
 * Check if a task is due in next 7 days
 */
function isDueNext7Days(dueAt: string | null, now: Date, timezone: string): boolean {
  if (!dueAt) return false;

  const due = new Date(dueAt);
  const todayEnd = endOfDay(now, timezone);
  const next7End = new Date(todayEnd);
  next7End.setDate(next7End.getDate() + 7);

  return due > todayEnd && due <= next7End;
}

/**
 * Check if a task is stale (active for >= 7 days without updates)
 */
function isStaleActive(item: InboxItem, now: Date): boolean {
  if (item.status !== "active") return false;

  const touchedAt = item.touched_at || item.created_at;
  const touched = new Date(touchedAt);
  const daysSinceTouched = (now.getTime() - touched.getTime()) / (1000 * 60 * 60 * 24);

  return daysSinceTouched >= 7;
}

/**
 * Build digest from current tasks
 */
export function buildDigest(
  now: Date,
  settings: WorkSettings,
  items: InboxItem[]
): Digest {
  const timezone = settings.timezone || "America/Phoenix";

  // Filter to non-done tasks
  const activeTasks = items.filter((item) => item.status !== "done");

  // Categorize tasks
  const overdueTasks: InboxItem[] = [];
  const dueTodayTasks: InboxItem[] = [];
  const dueNext7Tasks: InboxItem[] = [];
  const staleActiveTasks: InboxItem[] = [];

  for (const item of activeTasks) {
    if (isOverdue(item.result.due_at, now)) {
      overdueTasks.push(item);
    } else if (isDueToday(item.result.due_at, now, timezone)) {
      dueTodayTasks.push(item);
    } else if (isDueNext7Days(item.result.due_at, now, timezone)) {
      dueNext7Tasks.push(item);
    }

    if (isStaleActive(item, now)) {
      staleActiveTasks.push(item);
    }
  }

  // Build counts
  const counts: DigestCounts = {
    overdue: overdueTasks.length,
    dueToday: dueTodayTasks.length,
    dueNext7: dueNext7Tasks.length,
    staleActive: staleActiveTasks.length,
  };

  // Build examples (top 3 of each)
  const examples = {
    overdue: overdueTasks.slice(0, 3).map((item) => ({
      id: item.id,
      title: item.result.title,
      due_at: item.result.due_at,
    })),
    dueToday: dueTodayTasks.slice(0, 3).map((item) => ({
      id: item.id,
      title: item.result.title,
      due_at: item.result.due_at,
    })),
  };

  // Build label
  const dateStr = now.toLocaleDateString("en-US", {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const label = `Daily Digest — ${dateStr}`;

  // Build text
  const parts: string[] = [];
  if (counts.overdue > 0) {
    parts.push(`${counts.overdue} overdue`);
  }
  if (counts.dueToday > 0) {
    parts.push(`${counts.dueToday} due today`);
  }
  if (counts.dueNext7 > 0) {
    parts.push(`${counts.dueNext7} due next 7 days`);
  }
  if (counts.staleActive > 0) {
    parts.push(`${counts.staleActive} stale active`);
  }

  const text = parts.length > 0
    ? parts.join(" • ")
    : "No tasks due soon. You're all caught up!";

  // Build date string for ID
  const dateId = now.toLocaleDateString("en-CA", { timeZone: timezone }); // YYYY-MM-DD

  return {
    ts: now.toISOString(),
    date: dateId,
    label,
    counts,
    examples,
    text,
  };
}

/**
 * Format digest for notification
 */
export function formatNotificationTitle(digest: Digest): string {
  const parts: string[] = [];
  if (digest.counts.overdue > 0) {
    parts.push(`${digest.counts.overdue} overdue`);
  }
  if (digest.counts.dueToday > 0) {
    parts.push(`${digest.counts.dueToday} due today`);
  }

  if (parts.length === 0) {
    return "Tidy Daily: All caught up!";
  }

  return `Tidy Daily: ${parts.join(" • ")}`;
}

/**
 * Format digest for notification body
 */
export function formatNotificationBody(digest: Digest): string {
  const parts: string[] = [];

  if (digest.counts.dueNext7 > 0) {
    parts.push(`Due next 7 days: ${digest.counts.dueNext7}`);
  }
  if (digest.counts.staleActive > 0) {
    parts.push(`Stale actives: ${digest.counts.staleActive}`);
  }

  if (parts.length === 0 && digest.counts.overdue === 0 && digest.counts.dueToday === 0) {
    return "No urgent tasks. Great work!";
  }

  return parts.length > 0 ? parts.join(" • ") : "Tap to open Review";
}
