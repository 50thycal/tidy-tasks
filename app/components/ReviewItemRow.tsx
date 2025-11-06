import type { InboxItem } from "@/src/lib/clientStore";
import { formatFriendlyDate } from "@/src/lib/reviewUtils";
import ActionBar from "./ActionBar";

interface ReviewItemRowProps {
  item: InboxItem;
  onMarkDone: (id: string) => void;
  onMoveToActive: (id: string) => void;
  onMoveToInbox: (id: string) => void;
  onSnooze: (id: string, days: number) => void;
  onUnsnooze: (id: string) => void;
}

export default function ReviewItemRow({
  item,
  onMarkDone,
  onMoveToActive,
  onMoveToInbox,
  onSnooze,
  onUnsnooze,
}: ReviewItemRowProps) {
  const { result } = item;

  // Show first subtask or notes_append as rationale preview
  const rationalePreview =
    result.subtasks && result.subtasks.length > 0
      ? result.subtasks[0]
      : result.notes_append || null;

  return (
    <div
      style={{
        border: "1px solid #ddd",
        borderRadius: "8px",
        padding: "1rem",
        backgroundColor: "#fff",
        marginBottom: "0.75rem",
      }}
    >
      {/* Title */}
      <h4 style={{ margin: "0 0 0.5rem 0", color: "#111", fontSize: "1rem" }}>
        {result.title}
      </h4>

      {/* Metadata row */}
      <div
        style={{
          display: "flex",
          gap: "1rem",
          fontSize: "0.85rem",
          color: "#666",
          flexWrap: "wrap",
          marginBottom: "0.5rem",
        }}
      >
        {result.effort_min && <span>⏱️ {result.effort_min} min</span>}
        {result.energy && <span>⚡ {result.energy}</span>}
        {result.importance !== undefined && <span>🎯 {result.importance}</span>}
        {result.due_at && <span>📅 {formatFriendlyDate(result.due_at)}</span>}
      </div>

      {/* Project */}
      {result.project && (
        <div
          style={{
            fontSize: "0.85rem",
            color: "#1976d2",
            marginBottom: "0.5rem",
          }}
        >
          📂 {result.project}
        </div>
      )}

      {/* Tags */}
      {result.tags && result.tags.length > 0 && (
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
          {result.tags.map((tag) => (
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

      {/* Rationale preview */}
      {rationalePreview && (
        <div
          style={{
            fontSize: "0.85rem",
            color: "#999",
            fontStyle: "italic",
            marginBottom: "0.75rem",
            paddingLeft: "0.5rem",
            borderLeft: "2px solid #e0e0e0",
          }}
        >
          {rationalePreview}
        </div>
      )}

      {/* Snoozed until indicator */}
      {item.status === "snoozed" && item.snoozed_until && (
        <div
          style={{
            fontSize: "0.85rem",
            color: "#ff9800",
            marginBottom: "0.75rem",
            fontWeight: "500",
          }}
        >
          ⏰ Snoozed until {formatFriendlyDate(item.snoozed_until)}
        </div>
      )}

      {/* Action bar */}
      <ActionBar
        itemId={item.id}
        currentStatus={item.status}
        onMarkDone={onMarkDone}
        onMoveToActive={onMoveToActive}
        onMoveToInbox={onMoveToInbox}
        onSnooze={onSnooze}
        onUnsnooze={onUnsnooze}
      />
    </div>
  );
}
