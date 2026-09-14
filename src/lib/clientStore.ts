import type { CleanTaskRequest, CleanTaskResponse, EmailContext } from "@/src/types";
import { inc } from "@/src/db/metrics";
import { inferOwner } from "./contacts";

export type InboxItemStatus = "active" | "done" | "follow-up";

/** Whose court the task is in. "theirs" = waiting on someone else. */
export type TaskCourt = "mine" | "theirs" | "team";

/**
 * Snapshot of the AI's initial output, before any user edits.
 * Used for analyzing AI accuracy and calibrating prompts.
 */
export interface AIFirstPass {
  title: string;
  due_at: string | null;
  scheduled_for: string | null;
  effort_min: number;
  energy: string;
  tags: string[];
  project: string | null;
  subtasks: string[];
  importance: number;
  notes_append: string | null;
  /** If AI detected a project name not in the user's list */
  suggested_project?: string | null;
}

export interface InboxItem {
  id: string; // uuid
  created_at: string; // ISO 8601
  updated_at?: string; // ISO 8601
  touched_at?: string; // ISO 8601 (updated whenever status changes)
  request: CleanTaskRequest;
  result: CleanTaskResponse;
  status: InboxItemStatus;
  /** Snapshot of the AI's initial output for comparison */
  ai_first_pass?: AIFirstPass;
  /** Email context for tasks extracted from emails */
  email_context?: EmailContext;
  /** Person or org this task is with (for "theirs") or who asked for it (for "mine") */
  owner?: string | null;
  /** Whose court: defaults to "theirs" for follow-up status, else "mine" */
  court?: TaskCourt;
  /** When the ball went into their court (ISO). Used for days-waiting. */
  waiting_since?: string | null;
  /** Last time you poked them (ISO) */
  last_nudged_at?: string | null;
}

const STORAGE_KEY = "tidy.inbox";

/**
 * Get all inbox items from localStorage
 */
export function getInboxItems(): InboxItem[] {
  if (typeof window === "undefined") return [];

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];

    const items = JSON.parse(stored) as InboxItem[];
    return Array.isArray(items) ? items : [];
  } catch (error) {
    console.error("Error reading inbox items:", error);
    return [];
  }
}

/**
 * Save an inbox item to localStorage
 */
export function saveInboxItem(item: InboxItem): void {
  if (typeof window === "undefined") return;

  try {
    const items = getInboxItems();

    // De-dup by id
    const filtered = items.filter((existing) => existing.id !== item.id);
    filtered.unshift(item); // Add to beginning

    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error("Error saving inbox item:", error);
  }
}

/**
 * Save all inbox items to localStorage
 */
export function saveAllInboxItems(items: InboxItem[]): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (error) {
    console.error("Error saving all inbox items:", error);
    throw error;
  }
}

/**
 * Mutate a single inbox item
 */
export function mutateInboxItem(id: string, updater: (item: InboxItem) => InboxItem): void {
  if (typeof window === "undefined") return;

  try {
    const items = getInboxItems();
    const updated = items.map((item) =>
      item.id === id ? updater(item) : item
    );

    saveAllInboxItems(updated);
  } catch (error) {
    console.error("Error mutating inbox item:", error);
    throw error;
  }
}

/**
 * Bulk mutate multiple inbox items
 */
export function bulkMutateInboxItems(ids: string[], updater: (item: InboxItem) => InboxItem): void {
  if (typeof window === "undefined") return;

  try {
    const idsSet = new Set(ids);
    const items = getInboxItems();
    const updated = items.map((item) =>
      idsSet.has(item.id) ? updater(item) : item
    );

    saveAllInboxItems(updated);
  } catch (error) {
    console.error("Error bulk mutating inbox items:", error);
    throw error;
  }
}

/**
 * Update an inbox item's status
 */
export function updateInboxItemStatus(id: string, status: InboxItemStatus): void {
  mutateInboxItem(id, (item) => ({
    ...item,
    status,
    touched_at: new Date().toISOString(),
  }));
}

/**
 * Update an inbox item's result (task data)
 */
export function updateInboxItemResult(id: string, resultPatch: Partial<CleanTaskResponse>): void {
  mutateInboxItem(id, (item) => ({
    ...item,
    result: {
      ...item.result,
      ...resultPatch,
    },
    updated_at: new Date().toISOString(),
    touched_at: new Date().toISOString(),
  }));
}

/**
 * Mark an inbox item as done
 */
export async function markItemDone(id: string): Promise<void> {
  updateInboxItemStatus(id, "done");
  await inc('tasksCompleted');
}

/**
 * Move an inbox item to active
 */
export function moveItemToActive(id: string): void {
  updateInboxItemStatus(id, "active");
}

/**
 * Move an item to follow-up status (waiting on external input)
 */
export function moveItemToFollowUp(id: string): void {
  updateInboxItemStatus(id, "follow-up");
}

/**
 * Delete an inbox item
 */
export function deleteInboxItem(id: string): void {
  if (typeof window === "undefined") return;

  try {
    const items = getInboxItems();
    const filtered = items.filter((item) => item.id !== id);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error("Error deleting inbox item:", error);
  }
}

/**
 * Clear all inbox items
 */
export function clearInbox(): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error("Error clearing inbox:", error);
  }
}

/**
 * Bulk add multiple inbox items at once
 */
export function bulkAddInboxItems(items: InboxItem[]): void {
  if (typeof window === "undefined") return;

  try {
    const existingItems = getInboxItems();
    const existingIds = new Set(existingItems.map((item) => item.id));

    // Filter out duplicates and prepend new items
    const newItems = items.filter((item) => !existingIds.has(item.id));
    const merged = [...newItems, ...existingItems];

    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch (error) {
    console.error("Error bulk adding inbox items:", error);
    throw error;
  }
}

/**
 * Bulk mark items as done
 */
export async function bulkMarkDone(ids: string[]): Promise<void> {
  bulkMutateInboxItems(ids, (item) => ({
    ...item,
    status: "done",
    touched_at: new Date().toISOString(),
  }));

  // Increment metrics for each completed task
  for (let i = 0; i < ids.length; i++) {
    await inc('tasksCompleted');
  }
}

/**
 * Bulk update bucket for items
 */
export function bulkMoveToBucket(ids: string[], bucket: string): void {
  bulkMutateInboxItems(ids, (item) => ({
    ...item,
    result: {
      ...item.result,
      bucket,
    },
    updated_at: new Date().toISOString(),
  }));
}

/**
 * Bulk set due date
 */
export function bulkSetDue(ids: string[], dueAt: string | null): void {
  bulkMutateInboxItems(ids, (item) => ({
    ...item,
    result: {
      ...item.result,
      due_at: dueAt,
    },
    updated_at: new Date().toISOString(),
  }));
}

/** Effective court for an item, falling back to status. */
export function courtOf(item: InboxItem): TaskCourt {
  if (item.court) return item.court;
  return item.status === "follow-up" ? "theirs" : "mine";
}

/** Effective owner for an item, falling back to email context. */
export function ownerOf(item: InboxItem): string | null {
  return item.owner ?? item.email_context?.contact ?? null;
}

/** Set who a task is with and which court it is in. Moves status to match. */
export function setTaskCourt(id: string, patch: { owner?: string | null; court?: TaskCourt; follow_up_by?: string | null }): void {
  mutateInboxItem(id, (item) => {
    const court = patch.court ?? courtOf(item);
    const now = new Date().toISOString();
    const status: InboxItemStatus = item.status === "done" ? "done" : court === "theirs" ? "follow-up" : "active";
    const becameTheirs = court === "theirs" && courtOf(item) !== "theirs";
    return {
      ...item,
      owner: patch.owner !== undefined ? patch.owner : item.owner ?? item.email_context?.contact ?? null,
      court,
      status,
      waiting_since: court === "theirs" ? (becameTheirs || !item.waiting_since ? now : item.waiting_since) : null,
      result: patch.follow_up_by !== undefined ? { ...item.result, due_at: patch.follow_up_by } : item.result,
      touched_at: now,
      updated_at: now,
    };
  });
}

export function markNudged(id: string): void {
  mutateInboxItem(id, (item) => ({ ...item, last_nudged_at: new Date().toISOString(), touched_at: new Date().toISOString() }));
}

/**
 * One-time backfill: derive owner/court/waiting_since for items created before
 * these fields existed. Idempotent.
 */
export function ensureCourtFields(): number {
  if (typeof window === "undefined") return 0;
  const items = getInboxItems();
  let changed = 0;
  const next = items.map((item) => {
    if (item.court) return item;
    const court: TaskCourt = item.status === "follow-up" || item.result.tags?.includes("waiting") ? "theirs" : "mine";
    let owner = item.owner ?? item.email_context?.contact ?? null;
    if (!owner) {
      const guess = inferOwner(`${item.request?.raw_text ?? ""}\n${item.result.title}`, undefined, court === "theirs");
      if (guess && (court === "theirs" || guess.court === "theirs")) owner = guess.owner;
    }
    changed++;
    return {
      ...item,
      court,
      owner,
      waiting_since: court === "theirs" ? item.touched_at ?? item.updated_at ?? item.created_at : null,
    };
  });
  if (changed) saveAllInboxItems(next);
  return changed;
}
