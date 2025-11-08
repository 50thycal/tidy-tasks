/**
 * Export utilities for Tidy Tasks
 * Exports all local data to JSON or CSV format
 */

import type { InboxItem } from "./clientStore";
import type { TidySettingsDoc, WeeklySummaryResponse } from "@/src/types";
import type { Metrics } from "@/src/db/metrics";
import type { FocusLayout } from "@/src/db/focus";
import { getInboxItems } from "./clientStore";
import { getStoredSettings } from "./settings";
import { getMetrics } from "@/src/db/metrics";
import { tasksToCsv } from "./csv";

/**
 * Weekly summary with metadata (stored per week)
 */
export interface WeeklySummaryDoc {
  weekStart: string; // YYYY-MM-DD
  weekEnd: string; // YYYY-MM-DD
  summary: WeeklySummaryResponse;
  createdAt: string; // ISO timestamp
}

/**
 * Backup container (versioned)
 */
export interface BackupDoc {
  version: 1;
  exported_at: string; // ISO timestamp
  app: "tidy-tasks";
  tables: {
    tasks: InboxItem[];
    settings: TidySettingsDoc | null;
    summaries: WeeklySummaryDoc[];
    metrics: Metrics | null;
    focus_layout: FocusLayout[];
  };
}

/**
 * Get all weekly summaries from localStorage
 */
function getAllSummaries(): WeeklySummaryDoc[] {
  if (typeof window === "undefined") return [];

  const summaries: WeeklySummaryDoc[] = [];

  try {
    // Iterate through all localStorage keys
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("summary:")) {
        try {
          const value = localStorage.getItem(key);
          if (value) {
            const summary = JSON.parse(value) as WeeklySummaryResponse;
            // Extract week start and end from key (format: "summary:YYYY-MM-DD-YYYY-MM-DD")
            const parts = key.replace("summary:", "").split("-");
            if (parts.length >= 6) {
              const weekStart = `${parts[0]}-${parts[1]}-${parts[2]}`;
              const weekEnd = `${parts[3]}-${parts[4]}-${parts[5]}`;
              summaries.push({
                weekStart,
                weekEnd,
                summary,
                createdAt: new Date().toISOString(), // We don't store creation time, so use now
              });
            }
          }
        } catch (e) {
          console.warn(`Failed to parse summary from key: ${key}`, e);
        }
      }
    }
  } catch (error) {
    console.error("Error reading summaries:", error);
  }

  return summaries;
}

/**
 * Get all focus layouts from localStorage
 */
function getAllFocusLayouts(): FocusLayout[] {
  if (typeof window === "undefined") return [];

  try {
    const stored = localStorage.getItem("tidy.focus_layouts");
    if (!stored) return [];

    const layouts = JSON.parse(stored);
    if (typeof layouts === "object" && layouts !== null) {
      // Convert from Record<string, FocusLayout> to FocusLayout[]
      return Object.values(layouts);
    }
  } catch (error) {
    console.error("Error reading focus layouts:", error);
  }

  return [];
}

/**
 * Export all data to JSON
 */
export async function exportToJson(): Promise<BackupDoc> {
  const tasks = getInboxItems();
  const settings = getStoredSettings();
  const metrics = await getMetrics();
  const summaries = getAllSummaries();
  const focusLayouts = getAllFocusLayouts();

  const backup: BackupDoc = {
    version: 1,
    exported_at: new Date().toISOString(),
    app: "tidy-tasks",
    tables: {
      tasks,
      settings,
      summaries,
      metrics,
      focus_layout: focusLayouts,
    },
  };

  return backup;
}

/**
 * Export tasks to CSV string
 */
export async function exportTasksToCsv(): Promise<string> {
  const tasks = getInboxItems();
  return tasksToCsv(tasks);
}

/**
 * Download a string as a file
 */
export function downloadFile(content: string, filename: string, mimeType: string): void {
  if (typeof window === "undefined") return;

  try {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Error downloading file:", error);
    throw error;
  }
}

/**
 * Export and download JSON backup
 */
export async function exportAndDownloadJson(): Promise<void> {
  const backup = await exportToJson();
  const json = JSON.stringify(backup, null, 2);
  const today = new Date().toISOString().split("T")[0];
  downloadFile(json, `tidy-backup-${today}.json`, "application/json");
}

/**
 * Export and download CSV of tasks
 */
export async function exportAndDownloadCsv(): Promise<void> {
  const csv = await exportTasksToCsv();
  const today = new Date().toISOString().split("T")[0];
  downloadFile(csv, `tidy-tasks-${today}.csv`, "text/csv");
}
