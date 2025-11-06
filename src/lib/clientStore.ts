import type { CleanTaskRequest, CleanTaskResponse } from "@/src/types";

export type InboxItemStatus = "inbox" | "active" | "done" | "snoozed";

export interface InboxItem {
  id: string; // uuid
  created_at: string; // ISO 8601
  updated_at?: string; // ISO 8601
  touched_at?: string; // ISO 8601 (updated whenever status changes)
  snoozed_until?: string | null; // ISO 8601 (optional)
  request: CleanTaskRequest;
  result: CleanTaskResponse;
  status: InboxItemStatus;
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
 * Mark an inbox item as done
 */
export function markItemDone(id: string): void {
  updateInboxItemStatus(id, "done");
}

/**
 * Move an inbox item to active
 */
export function moveItemToActive(id: string): void {
  updateInboxItemStatus(id, "active");
}

/**
 * Move an inbox item back to inbox
 */
export function moveItemToInbox(id: string): void {
  updateInboxItemStatus(id, "inbox");
}

/**
 * Snooze an inbox item for N days
 */
export function snoozeItem(id: string, days: number): void {
  mutateInboxItem(id, (item) => {
    const now = new Date();
    const snoozeUntil = new Date(now);
    snoozeUntil.setDate(snoozeUntil.getDate() + days);

    return {
      ...item,
      status: "snoozed",
      snoozed_until: snoozeUntil.toISOString(),
      touched_at: now.toISOString(),
    };
  });
}

/**
 * Unsnooze an inbox item (move back to inbox)
 */
export function unsnoozeItem(id: string): void {
  mutateInboxItem(id, (item) => ({
    ...item,
    status: "inbox",
    snoozed_until: null,
    touched_at: new Date().toISOString(),
  }));
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
