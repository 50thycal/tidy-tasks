"use client";

import { useState, useEffect } from "react";
import BatchForm, { type BatchCleanOptions } from "@/app/components/BatchForm";
import BatchResults, { type BatchTaskResult } from "@/app/components/BatchResults";
import { bulkAddInboxItems, type InboxItem } from "@/src/lib/clientStore";
import { getWorkSettings } from "@/src/lib/settings";
import type { CleanTaskRequest, CleanTaskResponse } from "@/src/types";

const MAX_CONCURRENT = 3;

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

  const processLine = async (
    rawText: string,
    options: BatchCleanOptions,
    id: string
  ): Promise<BatchTaskResult> => {
    // Update status to running
    setResults((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: "running" as const } : r))
    );

    try {
      const settings = getWorkSettings();
      const today = new Date().toISOString().split("T")[0];

      const request: CleanTaskRequest = {
        raw_text: rawText,
        today,
        timezone: settings.timezone,
        redaction: {
          enabled: options.redactionEnabled,
          entities: options.redactionEntities,
        },
      };

      const response = await fetch("/api/ai/clean_task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...request, settings }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const result: CleanTaskResponse = await response.json();

      return {
        id,
        rawText,
        status: "success",
        request,
        result,
      };
    } catch (error) {
      return {
        id,
        rawText,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  };

  const processBatch = async (lines: string[], options: BatchCleanOptions) => {
    setIsProcessing(true);

    // Initialize results
    const initialResults: BatchTaskResult[] = lines.map((line, index) => ({
      id: `task-${Date.now()}-${index}`,
      rawText: line,
      status: "queued",
    }));

    setResults(initialResults);

    // Process with concurrency limit
    const queue = [...initialResults];
    const activePromises: Promise<BatchTaskResult>[] = [];

    const processNext = async (): Promise<void> => {
      while (queue.length > 0 || activePromises.length > 0) {
        // Start new tasks up to MAX_CONCURRENT
        while (activePromises.length < MAX_CONCURRENT && queue.length > 0) {
          const task = queue.shift()!;
          const promise = processLine(task.rawText, options, task.id).then((result) => {
            // Update result in state
            setResults((prev) => prev.map((r) => (r.id === result.id ? result : r)));
            return result;
          });
          activePromises.push(promise);
        }

        // Wait for at least one to complete
        if (activePromises.length > 0) {
          await Promise.race(activePromises);
          // Remove completed promises
          const stillActive: Promise<BatchTaskResult>[] = [];
          for (const p of activePromises) {
            const isComplete = await Promise.race([
              p.then(() => true),
              Promise.resolve(false),
            ]);
            if (!isComplete) {
              stillActive.push(p);
            }
          }
          activePromises.length = 0;
          activePromises.push(...stillActive);
        }
      }
    };

    await processNext();
    setIsProcessing(false);
  };

  const handleClean = (lines: string[], options: BatchCleanOptions) => {
    processBatch(lines, options);
  };

  const handleAddSelected = (selectedIds: string[], destination: "inbox" | "active") => {
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
          destination === "inbox" ? "Inbox" : "Active"
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

    // Get options from first failed result (assuming same options were used)
    // For simplicity, use defaults - in production, we'd save the original options
    const options: BatchCleanOptions = {
      redactionEnabled: true,
      redactionEntities: ["emails", "phones"],
    };

    // Remove failed tasks from results
    setResults((prev) => prev.filter((r) => r.status !== "failed"));

    // Re-process
    processBatch(lines, options);
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

  return (
    <div style={{ padding: "2rem" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <h1 style={{ marginBottom: "0.5rem" }}>Batch Capture</h1>
        <p style={{ color: "#666", marginBottom: "2rem" }}>
          Paste multiple tasks (one per line) and clean them all with AI
        </p>

        <BatchForm onClean={handleClean} isProcessing={isProcessing} />

        <BatchResults
          results={results}
          onAddSelected={handleAddSelected}
          onDiscardSelected={handleDiscardSelected}
          onRetryFailed={handleRetryFailed}
        />

        {/* Quick navigation (shown after adding tasks) */}
        {successCount > 0 && !isProcessing && (
          <div
            style={{
              marginTop: "2rem",
              padding: "1.5rem",
              backgroundColor: "#e8f5e9",
              borderRadius: "8px",
              textAlign: "center",
            }}
          >
            <div style={{ marginBottom: "1rem", color: "#2e7d32", fontWeight: "500" }}>
              Ready to continue?
            </div>
            <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
              <a
                href="/inbox"
                style={{
                  padding: "0.75rem 1.5rem",
                  backgroundColor: "#fff",
                  color: "#1976d2",
                  textDecoration: "none",
                  borderRadius: "4px",
                  border: "1px solid #1976d2",
                }}
              >
                Go to Inbox
              </a>
              <a
                href="/focus"
                style={{
                  padding: "0.75rem 1.5rem",
                  backgroundColor: "#1976d2",
                  color: "#fff",
                  textDecoration: "none",
                  borderRadius: "4px",
                }}
              >
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
              backgroundColor: "#323232",
              color: "#fff",
              borderRadius: "4px",
              boxShadow: "0 4px 8px rgba(0,0,0,0.2)",
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
