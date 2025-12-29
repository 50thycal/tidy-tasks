"use client";

import { useState, useEffect } from "react";
import BatchForm, { type BatchCleanOptions } from "@/app/components/BatchForm";
import BatchResults, { type BatchTaskResult } from "@/app/components/BatchResults";
import { bulkAddInboxItems, type InboxItem } from "@/src/lib/clientStore";
import { getWorkSettings, getWorkSettingsV2 } from "@/src/lib/settings";
import { runWithPool, splitTasks } from "@/src/lib/batchRunner";
import type { CleanTaskRequest, CleanTaskResponse } from "@/src/types";
import { Skeleton } from "@/src/ui/Skeleton";

export default function CapturePage() {
  const [mounted, setMounted] = useState(false);
  const [results, setResults] = useState<BatchTaskResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Show toast temporarily
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const handleClean = async (lines: string[], options: BatchCleanOptions, strictMode = false) => {
    console.log(`[Capture] Starting batch clean for ${lines.length} tasks${strictMode ? ' (strict mode)' : ''}`);
    setIsProcessing(true);

    // Initialize all tasks as queued
    const initialResults: BatchTaskResult[] = lines.map((line, index) => ({
      id: `task-${Date.now()}-${index}`,
      rawText: line,
      status: "queued",
    }));

    setResults(initialResults);

    // Get settings once
    const settings = getWorkSettings();
    const today = new Date().toISOString().split("T")[0];

    // Worker function for each task
    const worker = async (line: string, index: number): Promise<CleanTaskResponse> => {
      console.log(`[Capture] Processing task ${index}: ${line.substring(0, 40)}...`);

      const request: CleanTaskRequest & { mode?: 'default' | 'strict' } = {
        raw_text: line,
        today,
        timezone: settings.timezone,
        redaction: {
          enabled: options.redactionEnabled,
          entities: options.redactionEntities,
        },
        ...(strictMode && { mode: 'strict' }),
      };

      const response = await fetch("/api/ai/clean_task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...request, settings }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error(`[Capture] Task ${index} failed:`, errorData);
        throw new Error(
          errorData.error || `HTTP ${response.status}: ${await response.text()}`
        );
      }

      const result: CleanTaskResponse = await response.json();
      console.log(`[Capture] Task ${index} succeeded:`, result.title);
      return result;
    };

    // Progress callback
    const onProgress = (
      index: number,
      status: "running" | "success" | "failed",
      data?: CleanTaskResponse | any
    ) => {
      setResults((prev) => {
        const updated = [...prev];
        updated[index] = {
          ...updated[index],
          status,
          ...(status === "success" && data
            ? {
                result: data as CleanTaskResponse,
                request: {
                  raw_text: lines[index],
                  today,
                  timezone: settings.timezone,
                  redaction: {
                    enabled: options.redactionEnabled,
                    entities: options.redactionEntities,
                  },
                },
              }
            : {}),
          ...(status === "failed" && data
            ? {
                error:
                  data instanceof Error
                    ? data.message
                    : typeof data === "string"
                    ? data
                    : "Unknown error",
              }
            : {}),
        };
        return updated;
      });
    };

    try {
      // Run with pool (max 3 concurrent)
      await runWithPool(lines, 3, worker, onProgress);
      console.log("[Capture] Batch processing complete");
    } catch (error) {
      console.error("[Capture] Batch processing error:", error);
      setToast("Batch processing encountered errors. Check individual tasks.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAddSelected = (selectedIds: string[], destination: "follow-up" | "active") => {
    const selectedResults = results.filter(
      (r) => selectedIds.includes(r.id) && r.status === "success"
    );

    const newItems: InboxItem[] = selectedResults.map((r) => ({
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      status: destination,
      request: r.request!,
      result: r.result!,
    }));

    try {
      bulkAddInboxItems(newItems);

      // Remove selected from results
      setResults((prev) => prev.filter((r) => !selectedIds.includes(r.id)));

      setToast(
        `Added ${newItems.length} ${newItems.length === 1 ? "task" : "tasks"} to ${
          destination === "follow-up" ? "Follow-up" : "Active"
        }`
      );
    } catch (error) {
      setToast("Error adding tasks. Please try again.");
      console.error("Error adding tasks:", error);
    }
  };

  const handleDiscardSelected = (selectedIds: string[]) => {
    setResults((prev) => prev.filter((r) => !selectedIds.includes(r.id)));
    setToast(`Discarded ${selectedIds.length} ${selectedIds.length === 1 ? "task" : "tasks"}`);
  };

  const handleRetryFailed = () => {
    const failedResults = results.filter((r) => r.status === "failed");
    const lines = failedResults.map((r) => r.rawText);

    if (lines.length === 0) return;

    console.log(`[Capture] Retrying ${lines.length} failed tasks with strict mode`);

    // Get privacy settings from global settings (V2)
    const settingsV2 = getWorkSettingsV2();
    const privacyEnabled = settingsV2.privacy?.enabled ?? false;
    const redactionMode = settingsV2.privacy?.redactionMode ?? "emails_phones";

    // Map redaction mode to entities array
    let redactionEntities: Array<"emails" | "phones" | "proper_names"> = [];
    if (privacyEnabled) {
      if (redactionMode === "emails_phones") {
        redactionEntities = ["emails", "phones"];
      } else if (redactionMode === "emails_phones_names") {
        redactionEntities = ["emails", "phones", "proper_names"];
      }
    }

    const options: BatchCleanOptions = {
      redactionEnabled: privacyEnabled,
      redactionEntities,
    };

    // Remove failed tasks from results
    setResults((prev) => prev.filter((r) => r.status !== "failed"));

    // Re-process with strict mode
    handleClean(lines, options, true);
  };

  const handleRetryOne = (id: string) => {
    const failedResult = results.find((r) => r.id === id && r.status === "failed");
    if (!failedResult) return;

    console.log(`[Capture] Retrying one failed task with strict mode: ${failedResult.rawText.substring(0, 40)}`);

    // Get privacy settings from global settings (V2)
    const settingsV2 = getWorkSettingsV2();
    const privacyEnabled = settingsV2.privacy?.enabled ?? false;
    const redactionMode = settingsV2.privacy?.redactionMode ?? "emails_phones";

    // Map redaction mode to entities array
    let redactionEntities: Array<"emails" | "phones" | "proper_names"> = [];
    if (privacyEnabled) {
      if (redactionMode === "emails_phones") {
        redactionEntities = ["emails", "phones"];
      } else if (redactionMode === "emails_phones_names") {
        redactionEntities = ["emails", "phones", "proper_names"];
      }
    }

    const options: BatchCleanOptions = {
      redactionEnabled: privacyEnabled,
      redactionEntities,
    };

    // Remove this failed task from results
    setResults((prev) => prev.filter((r) => r.id !== id));

    // Re-process just this one with strict mode
    handleClean([failedResult.rawText], options, true);
  };

  const handleUpdateResult = (id: string, patch: Partial<CleanTaskResponse>) => {
    setResults((prev) =>
      prev.map((r) => {
        if (r.id === id && r.result) {
          return {
            ...r,
            result: {
              ...r.result,
              ...patch,
            },
          };
        }
        return r;
      })
    );
  };

  if (!mounted) {
    return (
      <div style={{ padding: "2rem" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <h1>Batch Capture</h1>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  const successCount = results.filter((r) => r.status === "success").length;
  const hasAnyResults = results.length > 0;

  return (
    <div style={{ padding: "2rem" }}>
      <div className="container">
        <h1 style={{ marginBottom: "0.5rem" }}>Batch Capture</h1>
        <p className="text-muted" style={{ marginBottom: "2rem" }}>
          Paste multiple tasks (one per line) and clean them all with AI
        </p>

        <BatchForm onClean={handleClean} isProcessing={isProcessing} />

        {/* Skeleton placeholders while initial processing */}
        {isProcessing && results.length === 0 && (
          <div style={{ marginTop: "2rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="card"
                style={{ padding: "1rem" }}
              >
                <Skeleton h={16} w="70%" />
                <div style={{ marginTop: "0.75rem" }}>
                  <Skeleton h={12} w="100%" />
                </div>
                <div style={{ marginTop: "0.5rem" }}>
                  <Skeleton h={12} w="85%" />
                </div>
              </div>
            ))}
          </div>
        )}

        {hasAnyResults && (
          <BatchResults
            results={results}
            onAddSelected={handleAddSelected}
            onDiscardSelected={handleDiscardSelected}
            onRetryFailed={handleRetryFailed}
            onRetryOne={handleRetryOne}
            onUpdateResult={handleUpdateResult}
          />
        )}

        {/* Quick navigation (shown when there are successful results and not processing) */}
        {successCount > 0 && !isProcessing && (
          <div className="card" style={{ marginTop: "2rem", padding: "1.5rem", textAlign: "center" }}>
            <div style={{ marginBottom: "1rem", color: "var(--accent-2)", fontWeight: "500" }}>
              Ready to continue?
            </div>
            <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
              <a href="/inbox" className="btn btn-muted">
                Go to Inbox
              </a>
              <a href="/focus" className="btn btn-primary">
                Go to Focus Queue
              </a>
            </div>
          </div>
        )}

        {/* Toast notification */}
        {toast && (
          <div
            style={{
              position: "fixed",
              bottom: "2rem",
              right: "2rem",
              padding: "1rem 1.5rem",
              backgroundColor: "var(--panel)",
              color: "var(--text)",
              borderRadius: "0.75rem",
              border: "1px solid var(--border)",
              boxShadow: "0 4px 8px rgba(0,0,0,0.3)",
              zIndex: 1000,
            }}
          >
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
