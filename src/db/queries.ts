import { getInboxItems, type InboxItem, type InboxItemStatus } from "@/src/lib/clientStore";

/**
 * Get tasks by status
 */
export function getTasksByStatus(statuses: InboxItemStatus[]): InboxItem[] {
  const allItems = getInboxItems();
  return allItems.filter((item) => statuses.includes(item.status));
}

/**
 * Get distinct project names from all tasks
 */
export function getDistinctProjects(): string[] {
  const allItems = getInboxItems();
  const projectsSet = new Set<string>();

  for (const item of allItems) {
    if (item.result.project) {
      projectsSet.add(item.result.project);
    }
  }

  return Array.from(projectsSet).sort((a, b) => a.localeCompare(b));
}

/**
 * Get distinct tags from all tasks
 */
export function getDistinctTags(): string[] {
  const allItems = getInboxItems();
  const tagsSet = new Set<string>();

  for (const item of allItems) {
    if (item.result.tags && item.result.tags.length > 0) {
      for (const tag of item.result.tags) {
        tagsSet.add(tag);
      }
    }
  }

  return Array.from(tagsSet).sort((a, b) => a.localeCompare(b));
}
