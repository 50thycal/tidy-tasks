"use client";

import { useState, useEffect } from "react";
import { bulkAddInboxItems, saveInboxItem, type InboxItem, type AIFirstPass } from "@/src/lib/clientStore";
import { getWorkSettings, addProject } from "@/src/lib/settings";
import { runWithPool } from "@/src/lib/batchRunner";
import type { CleanTaskRequest, CleanTaskResponse } from "@/src/types";

interface CapturePanelProps {
  isOpen: boolean;
  onToggle: () => void;
  onOpen?: () => void;
  onClose?: () => void;
  defaultBucket?: "active" | "follow-up";
  onTasksAdded?: () => void;
}

/** Extended response that may include suggested_project from API */
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

/** Modal for adding a new project */
interface AddProjectModalProps {
  suggestedName: string;
  onAdd: (name: string, notes?: string) => void;
  onSkip: () => void;
  onClose: () => void;
}

function AddProjectModal({ suggestedName, onAdd, onSkip, onClose }: AddProjectModalProps) {
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
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          backgroundColor: "var(--panel)",
          borderRadius: "8px",
          padding: "1.5rem",
          width: "90%",
          maxWidth: "400px",
          boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
        }}
      >
        <h3 style={{ margin: "0 0 1rem", fontSize: "1rem" }}>Add New Project</h3>
        <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginBottom: "1rem" }}>
          The AI detected a project that&apos;s not in your list. Would you like to add it?
        </p>

        <div style={{ marginBottom: "1rem" }}>
          <label style={{ display: "block", fontSize: "0.8rem", marginBottom: "0.25rem" }}>
            Project Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{
              width: "100%",
              padding: "0.5rem",
              backgroundColor: "var(--panel-2)",
              border: "1px solid var(--border)",
              borderRadius: "4px",
              color: "var(--text)",
              fontSize: "0.875rem",
            }}
          />
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <label style={{ display: "block", fontSize: "0.8rem", marginBottom: "0.25rem" }}>
            Notes (optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Description, aliases, or context..."
            style={{
              width: "100%",
              padding: "0.5rem",
              backgroundColor: "var(--panel-2)",
              border: "1px solid var(--border)",
              borderRadius: "4px",
              color: "var(--text)",
              fontSize: "0.875rem",
              minHeight: "60px",
              resize: "vertical",
            }}
          />
        </div>

        {error && (
          <div style={{ color: "var(--danger)", fontSize: "0.8rem", marginBottom: "0.5rem" }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
          <button
            onClick={onSkip}
            style={{
              padding: "0.5rem 1rem",
              backgroundColor: "var(--panel-2)",
              border: "1px solid var(--border)",
              borderRadius: "4px",
              color: "var(--text)",
              cursor: "pointer",
              fontSize: "0.85rem",
            }}
          >
            Skip
          </button>
          <button
            onClick={handleAdd}
            style={{
              padding: "0.5rem 1rem",
              backgroundColor: "var(--accent)",
              border: "none",
              borderRadius: "4px",
              color: "white",
              cursor: "pointer",
              fontSize: "0.85rem",
            }}
          >
            Add Project
          </button>
        </div>
      </div>
    </div>
  );
}

export function CapturePanel({ isOpen, onToggle, onOpen, onClose, defaultBucket = "active", onTasksAdded }: CapturePanelProps) {
  const [rawText, setRawText] = useState("");
  const [results, setResults] = useState<TaskResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Project suggestion modal state
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [pendingSuggestion, setPendingSuggestion] = useState<{
    projectName: string;
    taskIndex: number;
  } | null>(null);

  // Show toast temporarily
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Collect unique suggested projects from results
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

    const newItems: InboxItem[] = successResults.map((r) => {
      const result = r.result!;

      // Create ai_first_pass snapshot (excluding suggested_project from result)
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

      // Remove suggested_project from the result we store (it's not part of the task schema)
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

  // Handle adding a suggested project
  const handleAddSuggestedProject = (projectName: string) => {
    setPendingSuggestion({ projectName, taskIndex: 0 });
    setShowProjectModal(true);
  };

  const handleProjectAdded = (name: string, notes?: string) => {
    try {
      // Add the project to settings
      addProject({ name, notes, llmr_due: null, ifr_due: null, ifc_due: null });

      // Update all results that had this suggested_project to use it as their project
      setResults(prev => prev.map(r => {
        if (r.result?.suggested_project?.toLowerCase() === name.toLowerCase()) {
          return {
            ...r,
            result: {
              ...r.result,
              project: name,
              suggested_project: null, // Clear the suggestion since it's now added
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

  const handleSkipProject = () => {
    setShowProjectModal(false);
    setPendingSuggestion(null);
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
      {/* Hover trigger area - invisible strip on right edge */}
      {!isOpen && (
        <div
          onMouseEnter={onOpen}
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            width: "20px",
            height: "100vh",
            zIndex: 39,
            cursor: "pointer",
          }}
        />
      )}

      {/* Toggle Button - Always visible */}
      <button
        type="button"
        onClick={onToggle}
        onMouseEnter={!isOpen ? onOpen : undefined}
        style={{
          position: "fixed",
          top: "50%",
          right: isOpen ? "420px" : "0",
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
        onMouseLeave={onClose}
        style={{
          position: "fixed",
          top: 0,
          right: isOpen ? 0 : "-420px",
          width: "420px",
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
                        {/* Title */}
                        <div style={{ fontWeight: "500", color: "var(--text)", marginBottom: "0.5rem" }}>
                          {r.result.title}
                        </div>

                        {/* Project badge */}
                        {r.result.project && (
                          <span
                            style={{
                              display: "inline-block",
                              padding: "0.15rem 0.5rem",
                              backgroundColor: "var(--accent)",
                              color: "white",
                              borderRadius: "4px",
                              fontSize: "0.7rem",
                              fontWeight: "500",
                              marginBottom: "0.5rem",
                            }}
                          >
                            {r.result.project}
                          </span>
                        )}

                        {/* Suggested project badge (not in user's list) */}
                        {!r.result.project && r.result.suggested_project && (
                          <span
                            style={{
                              display: "inline-block",
                              padding: "0.15rem 0.5rem",
                              backgroundColor: "var(--warning)",
                              color: "white",
                              borderRadius: "4px",
                              fontSize: "0.7rem",
                              fontWeight: "500",
                              marginBottom: "0.5rem",
                              cursor: "pointer",
                            }}
                            title="Click to add this project"
                            onClick={() => handleAddSuggestedProject(r.result!.suggested_project!)}
                          >
                            + {r.result.suggested_project}
                          </span>
                        )}

                        {/* Task metadata row */}
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "0.5rem",
                            fontSize: "0.75rem",
                            color: "var(--muted)",
                            marginTop: "0.25rem",
                          }}
                        >
                          {/* Due date */}
                          {r.result.due_at && (
                            <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                              📅 {(() => {
                                // Handle both plain dates (YYYY-MM-DD) and ISO datetimes
                                const dateStr = r.result.due_at;
                                if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                                  // Plain date - parse as local to avoid timezone shift
                                  const [y, m, d] = dateStr.split('-').map(Number);
                                  return new Date(y, m - 1, d).toLocaleDateString();
                                }
                                // ISO datetime - extract date part and parse as local
                                const datePart = dateStr.split('T')[0];
                                const [y, m, d] = datePart.split('-').map(Number);
                                return new Date(y, m - 1, d).toLocaleDateString();
                              })()}
                            </span>
                          )}

                          {/* Duration */}
                          {r.result.effort_min && (
                            <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                              ⏱️ {r.result.effort_min >= 60 ? `${r.result.effort_min / 60}h` : `${r.result.effort_min}m`}
                            </span>
                          )}

                          {/* Importance */}
                          {r.result.importance !== undefined && (
                            <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                              ⚡ {r.result.importance}/100
                            </span>
                          )}
                        </div>

                        {/* Energy badge */}
                        {r.result.energy && (
                          <span
                            style={{
                              display: "inline-block",
                              padding: "0.15rem 0.4rem",
                              backgroundColor:
                                r.result.energy === "high"
                                  ? "var(--danger)"
                                  : r.result.energy === "med"
                                  ? "var(--warning)"
                                  : "var(--success)",
                              color: "white",
                              borderRadius: "4px",
                              fontSize: "0.65rem",
                              fontWeight: "500",
                              marginTop: "0.5rem",
                              textTransform: "uppercase",
                            }}
                          >
                            {r.result.energy === "med" ? "MEDIUM" : r.result.energy}
                          </span>
                        )}
                      </div>
                    )}
                    {r.status === "failed" && (
                      <div style={{ color: "var(--danger)" }}>❌ {r.error || "Failed"}</div>
                    )}
                  </div>
                ))}
              </div>

              {/* Suggested projects section */}
              {!isProcessing && suggestedProjects.length > 0 && (
                <div
                  style={{
                    padding: "0.75rem",
                    backgroundColor: "rgba(255, 193, 7, 0.1)",
                    border: "1px solid var(--warning)",
                    borderRadius: "6px",
                    fontSize: "0.8rem",
                  }}
                >
                  <div style={{ fontWeight: "500", marginBottom: "0.5rem", color: "var(--warning)" }}>
                    New projects detected
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                    {suggestedProjects.map((name) => (
                      <button
                        key={name}
                        onClick={() => handleAddSuggestedProject(name)}
                        style={{
                          padding: "0.25rem 0.5rem",
                          backgroundColor: "var(--warning)",
                          color: "white",
                          border: "none",
                          borderRadius: "4px",
                          fontSize: "0.75rem",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.25rem",
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

      {/* Add Project Modal */}
      {showProjectModal && pendingSuggestion && (
        <AddProjectModal
          suggestedName={pendingSuggestion.projectName}
          onAdd={handleProjectAdded}
          onSkip={handleSkipProject}
          onClose={() => setShowProjectModal(false)}
        />
      )}
    </>
  );
}
