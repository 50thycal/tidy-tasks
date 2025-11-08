/**
 * CSV export utilities for Tidy Tasks
 */

import type { InboxItem } from "./clientStore";

/**
 * Escape CSV field value
 */
function escapeCsvField(value: string | null | undefined): string {
  if (value == null) return "";

  const str = String(value);

  // If the field contains comma, quote, or newline, wrap in quotes and escape quotes
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Convert array of tasks to CSV string
 */
export function tasksToCsv(items: InboxItem[]): string {
  // Define CSV headers
  const headers = [
    "id",
    "status",
    "title",
    "effort_min",
    "energy",
    "importance",
    "project",
    "due_at",
    "scheduled_for",
    "tags",
    "created_at",
    "updated_at",
    "touched_at",
  ];

  // Build CSV rows
  const rows: string[] = [headers.join(",")];

  for (const item of items) {
    const row = [
      escapeCsvField(item.id),
      escapeCsvField(item.status),
      escapeCsvField(item.result.title),
      escapeCsvField(item.result.effort_min?.toString()),
      escapeCsvField(item.result.energy),
      escapeCsvField(item.result.importance?.toString()),
      escapeCsvField(item.result.project),
      escapeCsvField(item.result.due_at),
      escapeCsvField(item.result.scheduled_for),
      escapeCsvField(item.result.tags?.join(";") || ""),
      escapeCsvField(item.created_at),
      escapeCsvField(item.updated_at),
      escapeCsvField(item.touched_at),
    ];
    rows.push(row.join(","));
  }

  return rows.join("\n");
}
