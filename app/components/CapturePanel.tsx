"use client";

import { useState, useEffect } from "react";
import { bulkAddInboxItems, saveInboxItem, type InboxItem } from "@/src/lib/clientStore";
import { getWorkSettings, getWorkSettingsV2 } from "@/src/lib/settings";
import { inc } from "@/src/db/metrics";
import { runWithPool } from "@/src/lib/batchRunner";
import type { CleanTaskRequest, CleanTaskResponse } from "@/src/types";

interface CapturePanelProps {
  isOpen: boolean;
  onToggle: () => void;
  defaultBucket?: "inbox" | "active";
  onTasksAdded?: () => void;
}

interface TaskResult {
  id: string;
  rawText: string;
  status: "queued" | "running" | "success" | "failed";
  request?: CleanTaskRequest;
  result?: CleanTaskResponse;
  error?: string;
}

export function CapturePanel({ isOpen, onToggle, defaultBucket = "inbox", onTasksAdded }: CapturePanelProps) {
  const [rawText, setRawText] = useState("");
  const [results, setResults] = useState<TaskResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Show toast temporarily
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const lineCount = rawText.split("\n").filter((line) => line.trim().length > 0).length;

  const handleClean = async () => {
    const lines = rawText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length === 0) return;

    setIsProcessing(true);

    // Get privacy settings
    const settingsV2 = getWorkSettingsV2();
    const privacyEnabled = settingsV2.privacy?.enabled ?? false;
    const redactionMode = settingsV2.privacy?.redactionMode ?? "emails_phones";

    let redactionEntities: Array<"emails" | "phones" | "proper_names"> = [];
    if (privacyEnabled) {
      if (redactionMode === "emails_phones") {
        redactionEntities = ["emails", "phones"];
      } else if (redactionMode === "emails_phones_names") {
        redactionEntities = ["emails", "phones", "proper_names"];
      }
    }

    // Initialize all tasks as queued
    const initialResults: TaskResult[] = lines.map((line, index) => ({
      id: `task-${Date.now()}-${index}`,
      rawText: line,
      status: "queued",
    }));

    setResults(initialResults);

    const settings = getWorkSettings();
    const today = new Date().toISOString().split("T")[0];

    // Worker function for each task
    const worker = async (line: string, index: number): Promise<CleanTaskResponse> => {
      const request: CleanTaskRequest = {
        raw_text: line,
        today,
        timezone: settings.timezone,
        redaction: {
          enabled: privacyEnabled,
          entities: redactionEntities,
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

      return await response.json();
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
                    enabled: privacyEnabled,
                    entities: redactionEntities,
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
      await runWithPool(lines, 3, worker, onProgress);
    } catch (error) {
      console.error("[CapturePanel] Batch processing error:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAddAll = async () => {
    const successResults = results.filter((r) => r.status === "success");

    if (successResults.length === 0) return;

    const newItems: InboxItem[] = successResults.map((r) => ({
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      status: defaultBucket,
      request: r.request!,
      result: r.result!,
    }));

    try {
      bulkAddInboxItems(newItems);
      // Increment metrics for each task
      for (let i = 0; i < newItems.length; i++) {
        await inc('tasksCreated');
        await inc('aiCleans');
      }

      // Clear results and input
      setResults([]);
      setRawText("");

      setToast(`Added ${newItems.length} ${newItems.length === 1 ? "task" : "tasks"}`);
      onTasksAdded?.();
    } catch (error) {
      setToast("Error adding tasks. Please try again.");
      console.error("Error adding tasks:", error);
    }
  };

  const handleDiscard = () => {
    setResults([]);
    setRawText("");
  };

  const successCount = results.filter((r) => r.status === "success").length;
  const failedCount = results.filter((r) => r.status === "failed").length;
  const hasResults = results.length > 0;

  return (
    <>
      {/* Toggle Button - Always visible */}
      <button
        type="button"
        onClick={onToggle}
        style={{
          position: "fixed",
          top: "50%",
          right: isOpen ? "320px" : "0",
          transform: "translateY(-50%)",
          zIndex: 40,
          width: "2rem",
          height: "4rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "var(--accent)",
          color: "white",
          border: "none",
          borderRadius: "8px 0 0 8px",
          cursor: "pointer",
          fontSize: "1rem",
          transition: "right 0.3s ease",
          boxShadow: "-2px 0 8px rgba(0, 0, 0, 0.2)",
        }}
        aria-label={isOpen ? "Close capture panel" : "Open capture panel"}
        title={isOpen ? "Close" : "Add Tasks"}
      >
        {isOpen ? "›" : "+"}
      </button>

      {/* Slide-out Panel */}
      <aside
        style={{
          position: "fixed",
          top: 0,
          right: isOpen ? 0 : "-320px",
          width: "320px",
          height: "100vh",
          backgroundColor: "var(--panel)",
          borderLeft: "1px solid var(--border)",
          zIndex: 35,
          transition: "right 0.3s ease",
          display: "flex",
          flexDirection: "column",
          boxShadow: isOpen ? "-4px 0 16px rgba(0, 0, 0, 0.2)" : "none",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "1rem",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: "600" }}>Add Tasks</h3>
          <button
            type="button"
            onClick={onToggle}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--muted)",
              fontSize: "1.25rem",
              padding: "0.25rem",
              lineHeight: 1,
            }}
            aria-label="Close panel"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "1rem",
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
          }}
        >
          {/* Input Area */}
          {!hasResults && (
            <>
              <div>
                <label
                  htmlFor="capture-input"
                  style={{
                    display: "block",
                    fontSize: "0.85rem",
                    fontWeight: "500",
                    marginBottom: "0.5rem",
                    color: "var(--text)",
                  }}
                >
                  Enter tasks (one per line)
                </label>
                <textarea
                  id="capture-input"
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder="Call John about the project&#10;Buy groceries on Friday&#10;Review PR #123"
                  disabled={isProcessing}
                  style={{
                    width: "100%",
                    minHeight: "180px",
                    padding: "0.75rem",
                    backgroundColor: "var(--panel-2)",
                    color: "var(--text)",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    fontSize: "0.875rem",
                    fontFamily: "monospace",
                    resize: "vertical",
                  }}
                />
                <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.25rem" }}>
                  {lineCount} {lineCount === 1 ? "task" : "tasks"}
                </div>
              </div>

              <button
                type="button"
                onClick={handleClean}
                disabled={isProcessing || lineCount === 0}
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  backgroundColor: isProcessing || lineCount === 0 ? "var(--muted)" : "var(--accent)",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  fontSize: "0.875rem",
                  fontWeight: "500",
                  cursor: isProcessing || lineCount === 0 ? "not-allowed" : "pointer",
                }}
              >
                {isProcessing ? "Processing..." : "Clean with AI"}
              </button>
            </>
          )}

          {/* Results */}
          {hasResults && (
            <>
              <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
                {successCount} cleaned
                {failedCount > 0 && `, ${failedCount} failed`}
                {isProcessing && " (processing...)"}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {results.map((r) => (
                  <div
                    key={r.id}
                    style={{
                      padding: "0.75rem",
                      backgroundColor: "var(--panel-2)",
                      borderRadius: "6px",
                      border: "1px solid var(--border)",
                      fontSize: "0.85rem",
                    }}
                  >
                    {r.status === "queued" && (
                      <div style={{ color: "var(--muted)" }}>⏳ {r.rawText.substring(0, 50)}...</div>
                    )}
                    {r.status === "running" && (
                      <div style={{ color: "var(--accent)" }}>⚡ Processing...</div>
                    )}
                    {r.status === "success" && r.result && (
                      <div>
                        <div style={{ fontWeight: "500", color: "var(--text)" }}>{r.result.title}</div>
                        {r.result.project && (
                          <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.25rem" }}>
                            {r.result.project}
                          </div>
                        )}
                      </div>
                    )}
                    {r.status === "failed" && (
                      <div style={{ color: "var(--danger)" }}>❌ {r.error || "Failed"}</div>
                    )}
                  </div>
                ))}
              </div>

              {/* Action buttons */}
              {!isProcessing && successCount > 0 && (
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    type="button"
                    onClick={handleAddAll}
                    style={{
                      flex: 1,
                      padding: "0.75rem",
                      backgroundColor: "var(--accent)",
                      color: "white",
                      border: "none",
                      borderRadius: "6px",
                      fontSize: "0.875rem",
                      fontWeight: "500",
                      cursor: "pointer",
                    }}
                  >
                    Add All ({successCount})
                  </button>
                  <button
                    type="button"
                    onClick={handleDiscard}
                    style={{
                      padding: "0.75rem",
                      backgroundColor: "var(--panel-2)",
                      color: "var(--text)",
                      border: "1px solid var(--border)",
                      borderRadius: "6px",
                      fontSize: "0.875rem",
                      cursor: "pointer",
                    }}
                  >
                    Clear
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Toast */}
        {toast && (
          <div
            style={{
              position: "absolute",
              bottom: "1rem",
              left: "1rem",
              right: "1rem",
              padding: "0.75rem",
              backgroundColor: "var(--accent-2)",
              color: "white",
              borderRadius: "6px",
              fontSize: "0.85rem",
              textAlign: "center",
            }}
          >
            {toast}
          </div>
        )}
      </aside>
    </>
  );
}
