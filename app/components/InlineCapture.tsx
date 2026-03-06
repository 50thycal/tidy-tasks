"use client";

import { useState, useEffect } from "react";
import { bulkAddInboxItems, type InboxItem, type AIFirstPass } from "@/src/lib/clientStore";
import { getWorkSettings, addProject } from "@/src/lib/settings";
import { runWithPool } from "@/src/lib/batchRunner";
import type { CleanTaskRequest, CleanTaskResponse } from "@/src/types";

interface InlineCaptureProps {
  defaultBucket?: "active" | "follow-up";
  onTasksAdded?: () => void;
}

interface CleanTaskResponseWithSuggestion extends CleanTaskResponse {
  suggested_project?: string | null;
}

interface TaskResult {
  id: string;
  rawText: string;
  status: "queued" | "running" | "success" | "failed";
  request?: CleanTaskRequest;
  result?: CleanTaskResponseWithSuggestion;
  error?: string;
}

export function InlineCapture({ defaultBucket = "active", onTasksAdded }: InlineCaptureProps) {
  const [rawText, setRawText] = useState("");
  const [results, setResults] = useState<TaskResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Project suggestion modal state
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [pendingSuggestion, setPendingSuggestion] = useState<{
    projectName: string;
  } | null>(null);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const suggestedProjects = results
    .filter(r => r.status === "success" && r.result?.suggested_project)
    .map(r => r.result!.suggested_project!)
    .filter((name, index, arr) => arr.indexOf(name) === index);

  const lineCount = rawText.split("\n").filter((line) => line.trim().length > 0).length;

  const handleClean = async () => {
    const lines = rawText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length === 0) return;

    setIsProcessing(true);

    const initialResults: TaskResult[] = lines.map((line, index) => ({
      id: `task-${Date.now()}-${index}`,
      rawText: line,
      status: "queued",
    }));

    setResults(initialResults);

    const settings = getWorkSettings();
    const today = new Date().toISOString().split("T")[0];

    const worker = async (line: string, index: number): Promise<CleanTaskResponse> => {
      const request: CleanTaskRequest = {
        raw_text: line,
        today,
        timezone: settings.timezone,
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
      console.error("[InlineCapture] Batch processing error:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAddAll = async () => {
    const successResults = results.filter((r) => r.status === "success");
    if (successResults.length === 0) return;

    const newItems: InboxItem[] = successResults.map((r) => {
      const result = r.result!;

      const aiFirstPass: AIFirstPass = {
        title: result.title,
        due_at: result.due_at,
        scheduled_for: result.scheduled_for || null,
        effort_min: result.effort_min,
        energy: result.energy,
        tags: [...result.tags],
        project: result.project,
        subtasks: [...result.subtasks],
        importance: result.importance,
        notes_append: result.notes_append || null,
        suggested_project: result.suggested_project || null,
      };

      const { suggested_project, ...cleanResult } = result;

      return {
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        status: defaultBucket,
        request: r.request!,
        result: cleanResult as CleanTaskResponse,
        ai_first_pass: aiFirstPass,
      };
    });

    try {
      bulkAddInboxItems(newItems);
      setResults([]);
      setRawText("");
      setToast(`Added ${newItems.length} ${newItems.length === 1 ? "task" : "tasks"}`);
      onTasksAdded?.();
    } catch (error) {
      setToast("Error adding tasks. Please try again.");
      console.error("Error adding tasks:", error);
    }
  };

  const handleAddSuggestedProject = (projectName: string) => {
    setPendingSuggestion({ projectName });
    setShowProjectModal(true);
  };

  const handleProjectAdded = (name: string, notes?: string) => {
    try {
      addProject({ name, notes, llmr_due: null, ifr_due: null, ifc_due: null });
      setResults(prev => prev.map(r => {
        if (r.result?.suggested_project?.toLowerCase() === name.toLowerCase()) {
          return {
            ...r,
            result: {
              ...r.result,
              project: name,
              suggested_project: null,
            },
          };
        }
        return r;
      }));
      setToast(`Added project: ${name}`);
      setShowProjectModal(false);
      setPendingSuggestion(null);
    } catch (e: any) {
      setToast(e.message || "Failed to add project");
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
    <div
      style={{
        position: "sticky",
        top: "1rem",
        display: "flex",
        flexDirection: "column",
        gap: "0rem",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "1rem 1.25rem",
          borderBottom: "1px solid var(--border)",
          backgroundColor: "var(--panel)",
          borderRadius: "12px 12px 0 0",
          border: "1px solid var(--border)",
          borderBottomColor: "var(--border)",
        }}
      >
        <h3 style={{ margin: 0, fontSize: "0.95rem", fontWeight: "600" }}>
          Add Tasks
        </h3>
        <p style={{ margin: "0.25rem 0 0", fontSize: "0.8rem", color: "var(--muted)" }}>
          Type tasks below, one per line
        </p>
      </div>

      {/* Content */}
      <div
        style={{
          backgroundColor: "var(--panel)",
          borderRadius: "0 0 12px 12px",
          border: "1px solid var(--border)",
          borderTop: "none",
          padding: "1rem 1.25rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
          maxHeight: "calc(100vh - 10rem)",
          overflowY: "auto",
        }}
      >
        {/* Input Area */}
        {!hasResults && (
          <>
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder={"Call John about the project\nBuy groceries on Friday\nReview PR #123"}
              disabled={isProcessing}
              className="textarea"
              style={{
                minHeight: "140px",
                fontSize: "0.875rem",
                fontFamily: "inherit",
                resize: "vertical",
                borderRadius: "8px",
              }}
            />
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                {lineCount} {lineCount === 1 ? "task" : "tasks"}
              </span>
              <button
                type="button"
                onClick={handleClean}
                disabled={isProcessing || lineCount === 0}
                className="btn btn-primary"
                style={{
                  padding: "0.5rem 1.25rem",
                  fontSize: "0.85rem",
                }}
              >
                {isProcessing ? "Processing..." : "Clean with AI"}
              </button>
            </div>
          </>
        )}

        {/* Results */}
        {hasResults && (
          <>
            <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
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
                    borderRadius: "8px",
                    border: "1px solid var(--border)",
                    fontSize: "0.85rem",
                  }}
                >
                  {r.status === "queued" && (
                    <div style={{ color: "var(--muted)" }}>
                      Queued: {r.rawText.length > 50 ? r.rawText.substring(0, 50) + "..." : r.rawText}
                    </div>
                  )}
                  {r.status === "running" && (
                    <div style={{ color: "var(--accent)" }}>Processing...</div>
                  )}
                  {r.status === "success" && r.result && (
                    <div>
                      <div style={{ fontWeight: "500", color: "var(--text)", marginBottom: "0.35rem" }}>
                        {r.result.title}
                      </div>

                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginBottom: "0.35rem" }}>
                        {r.result.project && (
                          <span className="badge" style={{ fontSize: "0.7rem", padding: "0.15rem 0.5rem", backgroundColor: "var(--accent)", color: "white", border: "none" }}>
                            {r.result.project}
                          </span>
                        )}
                        {!r.result.project && r.result.suggested_project && (
                          <span
                            className="badge"
                            style={{ fontSize: "0.7rem", padding: "0.15rem 0.5rem", backgroundColor: "var(--warn)", color: "white", border: "none", cursor: "pointer" }}
                            title="Click to add this project"
                            onClick={() => handleAddSuggestedProject(r.result!.suggested_project!)}
                          >
                            + {r.result.suggested_project}
                          </span>
                        )}
                        {r.result.energy && (
                          <span
                            className="badge"
                            style={{
                              fontSize: "0.65rem",
                              padding: "0.15rem 0.4rem",
                              backgroundColor:
                                r.result.energy === "high" ? "var(--danger)"
                                : r.result.energy === "med" ? "var(--warn)"
                                : "var(--accent-2)",
                              color: "white",
                              border: "none",
                              textTransform: "uppercase",
                            }}
                          >
                            {r.result.energy === "med" ? "MEDIUM" : r.result.energy}
                          </span>
                        )}
                      </div>

                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "0.75rem",
                          fontSize: "0.75rem",
                          color: "var(--muted)",
                        }}
                      >
                        {r.result.due_at && (
                          <span>
                            Due: {(() => {
                              const dateStr = r.result.due_at;
                              const datePart = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
                              const [y, m, d] = datePart.split('-').map(Number);
                              return new Date(y, m - 1, d).toLocaleDateString();
                            })()}
                          </span>
                        )}
                        {r.result.effort_min && (
                          <span>
                            {r.result.effort_min >= 60 ? `${r.result.effort_min / 60}h` : `${r.result.effort_min}m`}
                          </span>
                        )}
                        {r.result.importance !== undefined && (
                          <span>
                            Importance: {r.result.importance}/100
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  {r.status === "failed" && (
                    <div style={{ color: "var(--danger)" }}>{r.error || "Failed"}</div>
                  )}
                </div>
              ))}
            </div>

            {/* Suggested projects */}
            {!isProcessing && suggestedProjects.length > 0 && (
              <div
                style={{
                  padding: "0.75rem",
                  backgroundColor: "rgba(245, 158, 11, 0.1)",
                  border: "1px solid var(--warn)",
                  borderRadius: "8px",
                  fontSize: "0.8rem",
                }}
              >
                <div style={{ fontWeight: "500", marginBottom: "0.5rem", color: "var(--warn)" }}>
                  New projects detected
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                  {suggestedProjects.map((name) => (
                    <button
                      key={name}
                      onClick={() => handleAddSuggestedProject(name)}
                      className="btn"
                      style={{
                        padding: "0.25rem 0.5rem",
                        backgroundColor: "var(--warn)",
                        color: "white",
                        border: "none",
                        borderRadius: "6px",
                        fontSize: "0.75rem",
                      }}
                    >
                      + Add &quot;{name}&quot;
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Action buttons */}
            {!isProcessing && successCount > 0 && (
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  onClick={handleAddAll}
                  className="btn btn-primary"
                  style={{ flex: 1, padding: "0.625rem" }}
                >
                  Add All ({successCount})
                </button>
                <button
                  type="button"
                  onClick={handleDiscard}
                  className="btn"
                  style={{ padding: "0.625rem" }}
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
            marginTop: "0.5rem",
            padding: "0.625rem",
            backgroundColor: "var(--accent-2)",
            color: "white",
            borderRadius: "8px",
            fontSize: "0.85rem",
            textAlign: "center",
          }}
        >
          {toast}
        </div>
      )}

      {/* Add Project Modal */}
      {showProjectModal && pendingSuggestion && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
          }}
          onClick={(e) => e.target === e.currentTarget && setShowProjectModal(false)}
        >
          <ProjectModal
            suggestedName={pendingSuggestion.projectName}
            onAdd={handleProjectAdded}
            onSkip={() => { setShowProjectModal(false); setPendingSuggestion(null); }}
            onClose={() => setShowProjectModal(false)}
          />
        </div>
      )}
    </div>
  );
}

function ProjectModal({ suggestedName, onAdd, onSkip, onClose }: {
  suggestedName: string;
  onAdd: (name: string, notes?: string) => void;
  onSkip: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(suggestedName);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleAdd = () => {
    if (!name.trim()) {
      setError("Project name is required");
      return;
    }
    try {
      onAdd(name.trim(), notes.trim() || undefined);
    } catch (e: any) {
      setError(e.message || "Failed to add project");
    }
  };

  return (
    <div
      style={{
        backgroundColor: "var(--panel)",
        borderRadius: "12px",
        padding: "1.5rem",
        width: "90%",
        maxWidth: "400px",
        boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
        border: "1px solid var(--border)",
      }}
    >
      <h3 style={{ margin: "0 0 0.75rem", fontSize: "1rem" }}>Add New Project</h3>
      <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginBottom: "1rem" }}>
        The AI detected a project that&apos;s not in your list.
      </p>

      <div style={{ marginBottom: "0.75rem" }}>
        <label style={{ display: "block", fontSize: "0.8rem", marginBottom: "0.25rem", color: "var(--muted)" }}>
          Project Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input"
          style={{ fontSize: "0.875rem" }}
        />
      </div>

      <div style={{ marginBottom: "1rem" }}>
        <label style={{ display: "block", fontSize: "0.8rem", marginBottom: "0.25rem", color: "var(--muted)" }}>
          Notes (optional)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Description, aliases, or context..."
          className="textarea"
          style={{ fontSize: "0.875rem", minHeight: "60px" }}
        />
      </div>

      {error && (
        <div style={{ color: "var(--danger)", fontSize: "0.8rem", marginBottom: "0.5rem" }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
        <button onClick={onSkip} className="btn" style={{ fontSize: "0.85rem" }}>
          Skip
        </button>
        <button onClick={handleAdd} className="btn btn-primary" style={{ fontSize: "0.85rem" }}>
          Add Project
        </button>
      </div>
    </div>
  );
}
