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

  return (
    <div
      style={{
        backgroundColor: "#fff",
        border: "1px solid #ddd",
        borderRadius: "8px",
        padding: "1.5rem",
        marginTop: "2rem",
      }}
    >
      <h2 style={{ marginBottom: "1rem", color: "#111" }}>Review Results</h2>

      {/* Processing indicator */}
      {processingCount > 0 && (
        <div
          style={{
            padding: "0.75rem",
            backgroundColor: "#e3f2fd",
            borderRadius: "4px",
            marginBottom: "1rem",
            color: "#1976d2",
            fontSize: "0.9rem",
          }}
        >
          Processing {processingCount} {processingCount === 1 ? "task" : "tasks"}...
        </div>
      )}

      {/* Failed tasks */}
      {failedResults.length > 0 && (
        <div
          style={{
            padding: "1rem",
            backgroundColor: "#ffebee",
            borderRadius: "4px",
            marginBottom: "1rem",
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
            <div style={{ color: "#c62828", fontWeight: "500" }}>
              {failedResults.length} {failedResults.length === 1 ? "task" : "tasks"} failed
            </div>
            <button
              onClick={onRetryFailed}
              style={{
                padding: "0.5rem 1rem",
                backgroundColor: "#c62828",
                color: "#fff",
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
                backgroundColor: "#fff",
                borderRadius: "4px",
                marginTop: "0.5rem",
              }}
            >
              <summary
                style={{
                  cursor: "pointer",
                  fontSize: "0.9rem",
                  color: "#666",
                }}
              >
                {result.rawText.substring(0, 60)}
                {result.rawText.length > 60 ? "..." : ""}
              </summary>
              <div
                style={{
                  marginTop: "0.5rem",
                  fontSize: "0.85rem",
                  color: "#c62828",
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
                <span style={{ fontSize: "0.9rem", color: "#111" }}>
                  Select all ({successResults.length})
                </span>
              </label>
              {selectedIds.size > 0 && (
                <span style={{ fontSize: "0.9rem", color: "#666" }}>
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
                <span style={{ color: "#111" }}>Add to Inbox</span>
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
                <span style={{ color: "#111" }}>Add to Active</span>
              </label>
            </div>
          </div>

          {/* Results list */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {successResults.map((result) => (
              <div
                key={result.id}
                style={{
                  border: "1px solid #ddd",
                  borderRadius: "8px",
                  padding: "1rem",
                  backgroundColor: selectedIds.has(result.id) ? "#f0f7ff" : "#fff",
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
                    <h4 style={{ margin: "0 0 0.5rem 0", color: "#111" }}>
                      {result.result?.title}
                    </h4>
                    <div
                      style={{
                        display: "flex",
                        gap: "0.75rem",
                        fontSize: "0.85rem",
                        color: "#666",
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
                          color: "#1976d2",
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
                              backgroundColor: "#e0e0e0",
                              borderRadius: "4px",
                              fontSize: "0.75rem",
                              color: "#666",
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
              onClick={handleDiscardSelected}
              disabled={selectedIds.size === 0}
              style={{
                padding: "0.75rem 1.5rem",
                backgroundColor: "#fff",
                color: "#666",
                border: "1px solid #ccc",
                borderRadius: "4px",
                fontSize: "1rem",
                cursor: selectedIds.size === 0 ? "not-allowed" : "pointer",
              }}
            >
              Discard Selected
            </button>
            <button
              onClick={handleAddSelected}
              disabled={selectedIds.size === 0}
              style={{
                padding: "0.75rem 1.5rem",
                backgroundColor: selectedIds.size === 0 ? "#ccc" : "#4caf50",
                color: "#fff",
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
