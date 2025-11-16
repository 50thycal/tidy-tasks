import { useState } from "react";
import type { CleanTaskResponse, CleanTaskRequest } from "@/src/types";
import { extractErrorMessage } from "@/src/lib/errors";
import TaskCard from "@/app/components/TaskCard";

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
  onRetryOne?: (id: string) => void;
  onUpdateResult?: (id: string, patch: Partial<CleanTaskResponse>) => void;
}

export default function BatchResults({
  results,
  onAddSelected,
  onDiscardSelected,
  onRetryFailed,
  onRetryOne,
  onUpdateResult,
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
              marginBottom: "0.75rem",
            }}
          >
            <div style={{ color: "var(--danger)", fontWeight: "500" }}>
              Failed ({failedResults.length})
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
                fontWeight: "500",
              }}
            >
              Retry all failed (Strict)
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {failedResults.map((result) => (
              <div
                key={result.id}
                style={{
                  padding: "0.75rem",
                  backgroundColor: "var(--panel-2)",
                  borderRadius: "4px",
                  border: "1px solid var(--border)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: "0.9rem",
                        color: "var(--text)",
                        marginBottom: "0.5rem",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={result.rawText}
                    >
                      {result.rawText}
                    </div>
                    <div
                      style={{
                        fontSize: "0.8rem",
                        color: "var(--danger)",
                        fontFamily: "monospace",
                      }}
                      title={extractErrorMessage(result.error)}
                    >
                      {extractErrorMessage(result.error).substring(0, 100)}
                      {extractErrorMessage(result.error).length > 100 ? "..." : ""}
                    </div>
                  </div>
                  {onRetryOne && (
                    <button
                      type="button"
                      onClick={() => onRetryOne(result.id)}
                      style={{
                        padding: "0.25rem 0.75rem",
                        backgroundColor: "var(--panel)",
                        color: "var(--text)",
                        border: "1px solid var(--border)",
                        borderRadius: "4px",
                        fontSize: "0.75rem",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Retry (Strict)
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
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
              <div key={result.id}>
                {result.result && (
                  <TaskCard
                    id={result.id}
                    result={result.result}
                    selectable={true}
                    isSelected={selectedIds.has(result.id)}
                    onToggleSelect={() => toggleSelect(result.id)}
                    onChange={onUpdateResult ? (patch) => onUpdateResult(result.id, patch) : undefined}
                  />
                )}
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
