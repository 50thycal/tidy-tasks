"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import TaskCard from "@/app/components/TaskCard";
import type { InboxItem } from "@/src/lib/clientStore";
import type { CleanTaskResponse } from "@/src/types";

interface DraggableTaskCardProps {
  id: string;
  inboxItem: InboxItem;
  rationale?: string;
  priorityScore?: number;
  bucketColor?: string;
  onMarkDone?: () => void;
  onMoveToInbox?: () => void;
  onRefresh?: () => void;
  onSendTo?: (bucket: "now" | "next" | "later" | "backlog") => void;
}

export default function DraggableTaskCard({
  id,
  inboxItem,
  rationale,
  priorityScore,
  bucketColor,
  onMarkDone,
  onMoveToInbox,
  onRefresh,
  onSendTo,
}: DraggableTaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Only show banner if we have meaningful AI metadata
  const showBanner = (rationale && rationale.trim().length > 0) || (priorityScore !== undefined && priorityScore > 0);

  return (
    <div ref={setNodeRef} style={style}>
      <div>
        {/* Priority score and rationale banner */}
        {showBanner && (
          <div
            style={{
              padding: "0.75rem 1rem",
              backgroundColor: bucketColor
                ? `color-mix(in srgb, ${bucketColor} 15%, transparent)`
                : "var(--panel)",
              borderRadius: "8px 8px 0 0",
              border: "1px solid var(--border)",
              borderBottom: "none",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            {/* Drag handle */}
            <div
              {...attributes}
              {...listeners}
              style={{
                cursor: "grab",
                padding: "0.25rem",
                marginRight: "0.5rem",
                color: "var(--muted)",
                fontSize: "1.2rem",
                userSelect: "none",
              }}
              title="Drag to reorder"
            >
              ⋮⋮
            </div>

            {rationale && (
              <p
                style={{
                  fontSize: "0.9rem",
                  color: "var(--muted)",
                  margin: 0,
                  fontStyle: "italic",
                  flex: 1,
                }}
              >
                {rationale}
              </p>
            )}

            {priorityScore !== undefined && (
              <span
                style={{
                  fontSize: "0.9rem",
                  fontWeight: "600",
                  color: bucketColor || "var(--accent)",
                  marginLeft: "1rem",
                }}
              >
                Score: {priorityScore}
              </span>
            )}

            {/* Send to menu */}
            {onSendTo && (
              <div style={{ position: "relative", marginLeft: "0.5rem" }}>
                <select
                  onChange={(e) => {
                    if (e.target.value) {
                      onSendTo(e.target.value as "now" | "next" | "later" | "backlog");
                      e.target.value = ""; // Reset selection
                    }
                  }}
                  style={{
                    padding: "0.25rem 0.5rem",
                    fontSize: "0.75rem",
                    backgroundColor: "var(--panel)",
                    color: "var(--text)",
                    border: "1px solid var(--border)",
                    borderRadius: "4px",
                    cursor: "pointer",
                  }}
                  defaultValue=""
                >
                  <option value="" disabled>
                    Send to...
                  </option>
                  <option value="now">Now</option>
                  <option value="next">Next</option>
                  <option value="later">Later</option>
                  <option value="backlog">Backlog</option>
                </select>
              </div>
            )}
          </div>
        )}

        {/* TaskCard with actions inside */}
        <div style={{ borderRadius: showBanner ? "0 0 8px 8px" : "8px", overflow: "hidden" }}>
          <TaskCard
            id={inboxItem.id}
            result={inboxItem.result}
            status={inboxItem.status}
            onToggleDone={onMarkDone}
            onMove={onMoveToInbox}
            onChange={onRefresh}
          />
        </div>
      </div>
    </div>
  );
}
