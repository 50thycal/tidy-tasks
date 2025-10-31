import type { CleanTaskRequest, CleanTaskResponse } from "@/src/types";

export interface InboxItem {
  id: string; // uuid
  created_at: string; // ISO 8601
  request: CleanTaskRequest;
  result: CleanTaskResponse;
  status: "inbox" | "active";
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
 * Update an inbox item's status
 */
export function updateInboxItemStatus(id: string, status: "inbox" | "active"): void {
  if (typeof window === "undefined") return;

  try {
    const items = getInboxItems();
    const updated = items.map((item) =>
      item.id === id ? { ...item, status } : item
    );

    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error("Error updating inbox item:", error);
  }
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
