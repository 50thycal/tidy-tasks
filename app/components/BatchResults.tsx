import { useState } from "react";
import type { CleanTaskResponse, CleanTaskRequest } from "@/src/types";

export interface BatchTaskResult {
  id: string;
  rawText: string;
  status: "queued" | "running" | "success" | "failed";
  request?: CleanTaskRequest;
  result?: CleanTaskResponse;
  error?: string;
}

interface BatchResultsProps {
  results: BatchTaskResult[];
  onAddSelected: (selectedIds: string[], destination: "inbox" | "active") => void;
  onDiscardSelected: (selectedIds: string[]) => void;
  onRetryFailed: () => void;
}

export default function BatchResults({
  results,
  onAddSelected,
  onDiscardSelected,
  onRetryFailed,
}: BatchResultsProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [destination, setDestination] = useState<"inbox" | "active">("inbox");

  const successResults = results.filter((r) => r.status === "success");
  const failedResults = results.filter((r) => r.status === "failed");

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === successResults.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(successResults.map((r) => r.id)));
    }
  };

  const handleAddSelected = () => {
    onAddSelected(Array.from(selectedIds), destination);
    setSelectedIds(new Set());
  };

  const handleDiscardSelected = () => {
    onDiscardSelected(Array.from(selectedIds));
    setSelectedIds(new Set());
  };

  if (results.length === 0) {
    return null;
  }

  const processingCount = results.filter((r) => r.status === "queued" || r.status === "running").length;
  const processingResults = results.filter((r) => r.status === "queued" || r.status === "running");

  return (
    <div
      style={{
        backgroundColor: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: "8px",
        padding: "1.5rem",
        marginTop: "2rem",
      }}
    >
      <h2 style={{ marginBottom: "1rem", color: "var(--text)" }}>Review Results</h2>

      {/* Processing tasks with individual status */}
      {processingResults.length > 0 && (
        <div
          style={{
            padding: "1rem",
            backgroundColor: "color-mix(in srgb, var(--accent) 15%, transparent)",
            borderRadius: "4px",
            marginBottom: "1rem",
            border: "1px solid var(--border)",
          }}
        >
          <div style={{ color: "var(--accent)", fontWeight: "500", marginBottom: "0.75rem" }}>
            Processing {processingCount} {processingCount === 1 ? "task" : "tasks"}...
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {processingResults.map((result) => (
              <div
                key={result.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  fontSize: "0.85rem",
                  color: "var(--muted)",
                  backgroundColor: "var(--panel-2)",
                  padding: "0.5rem",
                  borderRadius: "4px",
                }}
              >
                <span style={{ fontSize: "1rem" }}>
                  {result.status === "running" ? "⏳" : "⏸️"}
                </span>
                <span style={{ fontWeight: "500", color: result.status === "running" ? "var(--accent)" : "var(--muted)" }}>
                  {result.status === "running" ? "Running" : "Queued"}
                </span>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {result.rawText}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Failed tasks */}
      {failedResults.length > 0 && (
        <div
          style={{
            padding: "1rem",
            backgroundColor: "color-mix(in srgb, var(--danger) 15%, transparent)",
            borderRadius: "4px",
            marginBottom: "1rem",
            border: "1px solid var(--border)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "0.5rem",
            }}
          >
            <div style={{ color: "var(--danger)", fontWeight: "500" }}>
              {failedResults.length} {failedResults.length === 1 ? "task" : "tasks"} failed
            </div>
            <button
              type="button"
              onClick={onRetryFailed}
              style={{
                padding: "0.5rem 1rem",
                backgroundColor: "var(--danger)",
                color: "white",
                border: "none",
                borderRadius: "4px",
                fontSize: "0.85rem",
                cursor: "pointer",
              }}
            >
              Retry Failed
            </button>
          </div>
          {failedResults.map((result) => (
            <details
              key={result.id}
              style={{
                padding: "0.5rem",
                backgroundColor: "var(--panel-2)",
                borderRadius: "4px",
                marginTop: "0.5rem",
              }}
            >
              <summary
                style={{
                  cursor: "pointer",
                  fontSize: "0.9rem",
                  color: "var(--muted)",
                }}
              >
                {result.rawText.substring(0, 60)}
                {result.rawText.length > 60 ? "..." : ""}
              </summary>
              <div
                style={{
                  marginTop: "0.5rem",
                  fontSize: "0.85rem",
                  color: "var(--danger)",
                  fontFamily: "monospace",
                  whiteSpace: "pre-wrap",
                }}
              >
                {result.error || "Unknown error"}
              </div>
            </details>
          ))}
        </div>
      )}

      {/* Success results */}
      {successResults.length > 0 && (
        <>
          {/* Controls */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "1rem",
              flexWrap: "wrap",
              gap: "1rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.size === successResults.length && successResults.length > 0}
                  onChange={toggleSelectAll}
                />
                <span style={{ fontSize: "0.9rem", color: "var(--text)" }}>
                  Select all successes ({successResults.length})
                </span>
              </label>
              {selectedIds.size > 0 && (
                <span style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
                  {selectedIds.size} selected
                </span>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  fontSize: "0.9rem",
                }}
              >
                <input
                  type="radio"
                  name="destination"
                  value="inbox"
                  checked={destination === "inbox"}
                  onChange={() => setDestination("inbox")}
                />
                <span style={{ color: "var(--text)" }}>Add to Inbox</span>
              </label>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  fontSize: "0.9rem",
                }}
              >
                <input
                  type="radio"
                  name="destination"
                  value="active"
                  checked={destination === "active"}
                  onChange={() => setDestination("active")}
                />
                <span style={{ color: "var(--text)" }}>Add to Active</span>
              </label>
            </div>
          </div>

          {/* Results list */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {successResults.map((result) => (
              <div
                key={result.id}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  padding: "1rem",
                  backgroundColor: selectedIds.has(result.id) ? "color-mix(in srgb, var(--accent) 10%, transparent)" : "var(--panel-2)",
                  cursor: "pointer",
                }}
                onClick={() => toggleSelect(result.id)}
              >
                <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(result.id)}
                    onChange={() => toggleSelect(result.id)}
                    onClick={(e) => e.stopPropagation()}
                    style={{ marginTop: "0.25rem", cursor: "pointer" }}
                  />
                  <div style={{ flex: 1 }}>
                    <h4 style={{ margin: "0 0 0.5rem 0", color: "var(--text)" }}>
                      {result.result?.title}
                    </h4>
                    <div
                      style={{
                        display: "flex",
                        gap: "0.75rem",
                        fontSize: "0.85rem",
                        color: "var(--muted)",
                        flexWrap: "wrap",
                      }}
                    >
                      {result.result?.effort_min && (
                        <span>⏱️ {result.result.effort_min} min</span>
                      )}
                      {result.result?.energy && <span>⚡ {result.result.energy}</span>}
                      {result.result?.importance !== undefined && (
                        <span>🎯 {result.result.importance}</span>
                      )}
                      {result.result?.due_at && (
                        <span>
                          📅 {new Date(result.result.due_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    {result.result?.project && (
                      <div
                        style={{
                          marginTop: "0.5rem",
                          fontSize: "0.85rem",
                          color: "var(--accent)",
                        }}
                      >
                        📂 {result.result.project}
                      </div>
                    )}
                    {result.result?.tags && result.result.tags.length > 0 && (
                      <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.5rem" }}>
                        {result.result.tags.map((tag) => (
                          <span
                            key={tag}
                            style={{
                              padding: "0.25rem 0.5rem",
                              backgroundColor: "var(--panel)",
                              borderRadius: "4px",
                              fontSize: "0.75rem",
                              color: "var(--muted)",
                              border: "1px solid var(--border)",
                            }}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Action buttons */}
          <div
            style={{
              display: "flex",
              gap: "0.75rem",
              marginTop: "1.5rem",
              justifyContent: "flex-end",
            }}
          >
            <button
              type="button"
              onClick={handleDiscardSelected}
              disabled={selectedIds.size === 0}
              style={{
                padding: "0.75rem 1.5rem",
                backgroundColor: "var(--panel-2)",
                color: "var(--text)",
                border: "1px solid var(--border)",
                borderRadius: "4px",
                fontSize: "1rem",
                cursor: selectedIds.size === 0 ? "not-allowed" : "pointer",
                opacity: selectedIds.size === 0 ? 0.5 : 1,
              }}
            >
              Discard Selected
            </button>
            <button
              type="button"
              onClick={handleAddSelected}
              disabled={selectedIds.size === 0}
              style={{
                padding: "0.75rem 1.5rem",
                backgroundColor: selectedIds.size === 0 ? "var(--muted)" : "var(--accent-2)",
                color: "white",
                border: "none",
                borderRadius: "4px",
                fontSize: "1rem",
                fontWeight: "500",
                cursor: selectedIds.size === 0 ? "not-allowed" : "pointer",
              }}
            >
              Add Selected ({selectedIds.size})
            </button>
          </div>
        </>
      )}
    </div>
  );
}
