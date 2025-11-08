import type { InboxItem, InboxItemStatus } from "@/src/lib/clientStore";
import type { WorkSettings } from "@/src/types";
import { todayRange, thisWeekRange, nextWeekRange, isOverdue, isInRange } from "@/src/lib/dateRanges";

export interface Filters {
  q: string; // Free text search
  statuses?: InboxItemStatus[]; // inbox/active/done/snoozed
  projects?: string[]; // OR logic
  tags?: string[]; // OR logic
  due: "any" | "overdue" | "today" | "thisWeek" | "nextWeek" | "none";
  energy: "any" | "low" | "med" | "high";
  effort: number | "any"; // 5|15|30|60|120
}

export const DEFAULT_FILTERS: Filters = {
  q: "",
  statuses: ["inbox", "active"],
  projects: [],
  tags: [],
  due: "any",
  energy: "any",
  effort: "any",
};

export const DEFAULT_FILTERS_FOCUS: Filters = {
  q: "",
  statuses: undefined, // No status filter on Focus
  projects: [],
  tags: [],
  due: "any",
  energy: "any",
  effort: "any",
};

/**
 * Apply all filters to a list of inbox items
 */
export function applyFilters(
  items: InboxItem[],
  filters: Filters,
  settings: WorkSettings
): InboxItem[] {
  let filtered = items;

  const now = new Date();

  // Filter by status
  if (filters.statuses && filters.statuses.length > 0) {
    filtered = filtered.filter((item) => filters.statuses!.includes(item.status));
  }

  // Filter by due date range
  if (filters.due !== "any") {
    if (filters.due === "none") {
      filtered = filtered.filter((item) => !item.result.due_at);
    } else if (filters.due === "overdue") {
      filtered = filtered.filter((item) => isOverdue(item.result.due_at, now));
    } else if (filters.due === "today") {
      const [start, end] = todayRange(now, settings.timezone, settings.endOfDay);
      filtered = filtered.filter((item) => isInRange(item.result.due_at, start, end));
    } else if (filters.due === "thisWeek") {
      const [start, end] = thisWeekRange(now, settings);
      filtered = filtered.filter((item) => isInRange(item.result.due_at, start, end));
    } else if (filters.due === "nextWeek") {
      const [start, end] = nextWeekRange(now, settings);
      filtered = filtered.filter((item) => isInRange(item.result.due_at, start, end));
    }
  }

  // Filter by projects (OR logic)
  if (filters.projects && filters.projects.length > 0) {
    filtered = filtered.filter((item) => {
      if (!item.result.project) return false;
      return filters.projects!.includes(item.result.project);
    });
  }

  // Filter by tags (OR logic)
  if (filters.tags && filters.tags.length > 0) {
    filtered = filtered.filter((item) => {
      if (!item.result.tags || item.result.tags.length === 0) return false;
      return item.result.tags.some((tag) => filters.tags!.includes(tag));
    });
  }

  // Filter by energy
  if (filters.energy !== "any") {
    filtered = filtered.filter((item) => item.result.energy === filters.energy);
  }

  // Filter by effort
  if (filters.effort !== "any") {
    filtered = filtered.filter((item) => item.result.effort_min === filters.effort);
  }

  // Free-text search (case-insensitive, substring match)
  if (filters.q && filters.q.trim().length > 0) {
    const query = filters.q.trim().toLowerCase();
    filtered = filtered.filter((item) => {
      const { result } = item;

      // Search in title
      if (result.title.toLowerCase().includes(query)) return true;

      // Search in project
      if (result.project && result.project.toLowerCase().includes(query)) return true;

      // Search in tags
      if (result.tags && result.tags.some((tag) => tag.toLowerCase().includes(query))) return true;

      // Search in subtasks
      if (
        result.subtasks &&
        result.subtasks.some((subtask) => subtask.toLowerCase().includes(query))
      )
        return true;

      return false;
    });
  }

  return filtered;
}
