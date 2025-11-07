"use client";

import { useState } from "react";
import type { CleanTaskResponse } from "@/src/types";

interface TaskCardProps {
  result: CleanTaskResponse;
  showActions?: boolean;
  onMoveToActive?: () => void;
  onDelete?: () => void;
}

export default function TaskCard({
  result,
  showActions = false,
  onMoveToActive,
  onDelete,
}: TaskCardProps) {
  const [showJson, setShowJson] = useState(false);

  // Format date-time for display
  const formatDateTime = (isoString: string | null) => {
    if (!isoString) return "No deadline";
    try {
      const date = new Date(isoString);
      return date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: "8px",
        padding: "1rem",
        backgroundColor: "var(--panel-2)",
        color: "var(--text)",
      }}
    >
      {/* Title */}
      <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1.1rem", fontWeight: "600", color: "var(--text)" }}>
        {result.title}
      </h3>

      {/* Due date */}
      <div style={{ fontSize: "0.9rem", color: "var(--muted)", marginBottom: "0.75rem" }}>
        <strong>Due:</strong> {formatDateTime(result.due_at)}
      </div>

      {/* Effort & Energy */}
      <div
        style={{
          display: "flex",
          gap: "1rem",
          marginBottom: "0.75rem",
          fontSize: "0.9rem",
        }}
      >
        <span>
          <strong>Effort:</strong> {result.effort_min} min
        </span>
        <span>
          <strong>Energy:</strong> {result.energy}
        </span>
      </div>

      {/* Importance bar */}
      <div style={{ marginBottom: "0.75rem" }}>
        <div style={{ fontSize: "0.85rem", marginBottom: "0.25rem", color: "var(--muted)" }}>
          <strong>Importance:</strong> {result.importance}/100
        </div>
        <div
          style={{
            height: "6px",
            backgroundColor: "var(--panel)",
            borderRadius: "3px",
            overflow: "hidden",
            border: "1px solid var(--border)",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${result.importance}%`,
              backgroundColor: result.importance > 75 ? "var(--danger)" : result.importance > 50 ? "var(--warn)" : "var(--accent-2)",
            }}
          />
        </div>
      </div>

      {/* Project */}
      {result.project && (
        <div style={{ fontSize: "0.9rem", marginBottom: "0.75rem" }}>
          <strong>Project:</strong> {result.project}
        </div>
      )}

      {/* Tags */}
      {result.tags && result.tags.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.75rem" }}>
          {result.tags.map((tag, idx) => (
            <span
              key={idx}
              style={{
                padding: "0.25rem 0.5rem",
                backgroundColor: "color-mix(in srgb, var(--accent) 15%, transparent)",
                color: "var(--accent)",
                borderRadius: "4px",
                fontSize: "0.85rem",
                border: "1px solid var(--border)",
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Subtasks */}
      {result.subtasks && result.subtasks.length > 0 && (
        <div style={{ marginBottom: "0.75rem" }}>
          <strong style={{ fontSize: "0.9rem" }}>Subtasks:</strong>
          <ul style={{ margin: "0.25rem 0 0 1.5rem", padding: 0, fontSize: "0.9rem" }}>
            {result.subtasks.map((subtask, idx) => (
              <li key={idx}>{subtask}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Notes append */}
      {result.notes_append && (
        <div
          style={{
            padding: "0.5rem",
            backgroundColor: "color-mix(in srgb, var(--warn) 15%, transparent)",
            borderRadius: "4px",
            fontSize: "0.85rem",
            marginBottom: "0.75rem",
            border: "1px solid var(--border)",
          }}
        >
          <strong>Note:</strong> {result.notes_append}
        </div>
      )}

      {/* Actions */}
      {showActions && (
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
          {onMoveToActive && (
            <button
              onClick={onMoveToActive}
              style={{
                padding: "0.5rem 1rem",
                backgroundColor: "var(--accent-2)",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "0.9rem",
              }}
            >
              Move to Active
            </button>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              style={{
                padding: "0.5rem 1rem",
                backgroundColor: "var(--danger)",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "0.9rem",
              }}
            >
              Delete
            </button>
          )}
        </div>
      )}

      {/* Collapsible JSON */}
      <div style={{ marginTop: "1rem", borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
        <button
          onClick={() => setShowJson(!showJson)}
          style={{
            background: "none",
            border: "none",
            color: "var(--accent)",
            cursor: "pointer",
            fontSize: "0.85rem",
            padding: 0,
          }}
        >
          {showJson ? "▼ Hide JSON" : "▶ Show JSON"}
        </button>
        {showJson && (
          <pre
            style={{
              marginTop: "0.5rem",
              padding: "0.75rem",
              backgroundColor: "var(--panel)",
              borderRadius: "4px",
              fontSize: "0.75rem",
              overflow: "auto",
              maxHeight: "300px",
              border: "1px solid var(--border)",
            }}
          >
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
