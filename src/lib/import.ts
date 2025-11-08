/**
 * Import utilities for Tidy Tasks
 * Imports backup data with validation
 */

import type { BackupDoc, WeeklySummaryDoc } from "./export";
import type { InboxItem } from "./clientStore";
import { getInboxItems, saveAllInboxItems, clearInbox } from "./clientStore";
import { saveSettings, resetSettings } from "./settings";
import { reset as resetMetrics } from "@/src/db/metrics";

/**
 * Import result statistics
 */
export interface ImportResult {
  added: {
    tasks: number;
    summaries: number;
    layouts: number;
  };
  updated: {
    tasks: number;
    summaries: number;
    layouts: number;
  };
  skipped: number;
  settings: boolean;
  metrics: boolean;
}

/**
 * Validate backup document structure
 * Throws error if invalid
 */
export function validateBackup(doc: unknown): asserts doc is BackupDoc {
  if (!doc || typeof doc !== "object") {
    throw new Error("Invalid backup: not an object");
  }

  const backup = doc as any;

  // Check version
  if (backup.version !== 1) {
    throw new Error(`Unsupported backup version: ${backup.version}. This app only supports version 1.`);
  }

  // Check app
  if (backup.app !== "tidy-tasks") {
    throw new Error(`Invalid backup: expected app "tidy-tasks", got "${backup.app}"`);
  }

  // Check tables
  if (!backup.tables || typeof backup.tables !== "object") {
    throw new Error("Invalid backup: missing or invalid tables");
  }

  // Check each table exists and is the right type
  if (!Array.isArray(backup.tables.tasks)) {
    throw new Error("Invalid backup: tasks must be an array");
  }

  if (backup.tables.settings !== null && typeof backup.tables.settings !== "object") {
    throw new Error("Invalid backup: settings must be an object or null");
  }

  if (!Array.isArray(backup.tables.summaries)) {
    throw new Error("Invalid backup: summaries must be an array");
  }

  if (backup.tables.metrics !== null && typeof backup.tables.metrics !== "object") {
    throw new Error("Invalid backup: metrics must be an object or null");
  }

  if (!Array.isArray(backup.tables.focus_layout)) {
    throw new Error("Invalid backup: focus_layout must be an array");
  }
}

/**
 * Import backup data
 */
export async function importBackup(
  doc: BackupDoc,
  mode: "append" | "replace"
): Promise<ImportResult> {
  if (typeof window === "undefined") {
    throw new Error("Import can only be run in browser");
  }

  const result: ImportResult = {
    added: { tasks: 0, summaries: 0, layouts: 0 },
    updated: { tasks: 0, summaries: 0, layouts: 0 },
    skipped: 0,
    settings: false,
    metrics: false,
  };

  try {
    if (mode === "replace") {
      // Clear all existing data
      clearInbox();
      resetSettings();
      await resetMetrics();
      clearAllSummaries();
      clearAllFocusLayouts();

      // Import all new data
      saveAllInboxItems(doc.tables.tasks);
      result.added.tasks = doc.tables.tasks.length;

      if (doc.tables.settings) {
        saveSettings(doc.tables.settings);
        result.settings = true;
      }

      if (doc.tables.metrics) {
        localStorage.setItem("tidy.metrics", JSON.stringify(doc.tables.metrics));
        result.metrics = true;
      }

      // Import summaries
      for (const summaryDoc of doc.tables.summaries) {
        saveSummary(summaryDoc);
        result.added.summaries++;
      }

      // Import focus layouts
      for (const layout of doc.tables.focus_layout) {
        saveFocusLayout(layout);
        result.added.layouts++;
      }
    } else {
      // Append mode - merge with existing data
      const existingItems = getInboxItems();
      const existingIds = new Set(existingItems.map((item) => item.id));

      // Tasks: skip duplicates by ID
      const newTasks = doc.tables.tasks.filter((task) => !existingIds.has(task.id));
      result.added.tasks = newTasks.length;
      result.skipped = doc.tables.tasks.length - newTasks.length;

      // Merge new tasks with existing ones
      const mergedTasks = [...newTasks, ...existingItems];
      saveAllInboxItems(mergedTasks);

      // Settings: replace if present
      if (doc.tables.settings) {
        saveSettings(doc.tables.settings);
        result.settings = true;
      }

      // Metrics: replace if present
      if (doc.tables.metrics) {
        localStorage.setItem("tidy.metrics", JSON.stringify(doc.tables.metrics));
        result.metrics = true;
      }

      // Summaries: upsert by week key (replace existing)
      for (const summaryDoc of doc.tables.summaries) {
        const existing = getSummary(summaryDoc.weekStart, summaryDoc.weekEnd);
        saveSummary(summaryDoc);
        if (existing) {
          result.updated.summaries++;
        } else {
          result.added.summaries++;
        }
      }

      // Focus layouts: upsert by date (replace existing)
      for (const layout of doc.tables.focus_layout) {
        const existing = getFocusLayoutByDate(layout.date);
        saveFocusLayout(layout);
        if (existing) {
          result.updated.layouts++;
        } else {
          result.added.layouts++;
        }
      }
    }

    return result;
  } catch (error) {
    console.error("Error during import:", error);
    throw new Error(`Import failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Clear all weekly summaries
 */
function clearAllSummaries(): void {
  if (typeof window === "undefined") return;

  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("summary:")) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
  } catch (error) {
    console.error("Error clearing summaries:", error);
  }
}

/**
 * Clear all focus layouts
 */
function clearAllFocusLayouts(): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.removeItem("tidy.focus_layouts");
  } catch (error) {
    console.error("Error clearing focus layouts:", error);
  }
}

/**
 * Save a weekly summary to localStorage
 */
function saveSummary(doc: WeeklySummaryDoc): void {
  if (typeof window === "undefined") return;

  try {
    const key = `summary:${doc.weekStart}-${doc.weekEnd}`;
    localStorage.setItem(key, JSON.stringify(doc.summary));
  } catch (error) {
    console.error("Error saving summary:", error);
  }
}

/**
 * Get a weekly summary from localStorage
 */
function getSummary(weekStart: string, weekEnd: string): WeeklySummaryDoc | null {
  if (typeof window === "undefined") return null;

  try {
    const key = `summary:${weekStart}-${weekEnd}`;
    const value = localStorage.getItem(key);
    if (value) {
      const summary = JSON.parse(value);
      return {
        weekStart,
        weekEnd,
        summary,
        createdAt: new Date().toISOString(),
      };
    }
  } catch (error) {
    console.error("Error getting summary:", error);
  }

  return null;
}

/**
 * Save a focus layout to localStorage
 */
function saveFocusLayout(layout: any): void {
  if (typeof window === "undefined") return;

  try {
    const stored = localStorage.getItem("tidy.focus_layouts");
    const layouts = stored ? JSON.parse(stored) : {};
    layouts[layout.date] = layout;
    localStorage.setItem("tidy.focus_layouts", JSON.stringify(layouts));
  } catch (error) {
    console.error("Error saving focus layout:", error);
  }
}

/**
 * Get a focus layout by date
 */
function getFocusLayoutByDate(date: string): any | null {
  if (typeof window === "undefined") return null;

  try {
    const stored = localStorage.getItem("tidy.focus_layouts");
    if (stored) {
      const layouts = JSON.parse(stored);
      return layouts[date] || null;
    }
  } catch (error) {
    console.error("Error getting focus layout:", error);
  }

  return null;
}

/**
 * Get preview information from backup document
 */
export function getBackupPreview(doc: BackupDoc) {
  return {
    tasks: doc.tables.tasks.length,
    settings: doc.tables.settings ? 1 : 0,
    summaries: doc.tables.summaries.length,
    layouts: doc.tables.focus_layout.length,
    metrics: doc.tables.metrics ? 1 : 0,
    exportedAt: doc.exported_at,
    version: doc.version,
  };
}
