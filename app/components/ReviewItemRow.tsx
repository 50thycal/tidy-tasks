import type { InboxItem } from "@/src/lib/clientStore";
import { formatFriendlyDate } from "@/src/lib/reviewUtils";
import ActionBar from "./ActionBar";

interface ReviewItemRowProps {
  item: InboxItem;
  onMarkDone: (id: string) => void;
  onMoveToActive: (id: string) => void;
  onMoveToFollowUp: (id: string) => void;
}

export default function ReviewItemRow({
  item,
  onMarkDone,
  onMoveToActive,
  onMoveToFollowUp,
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
        border: "1px solid var(--border)",
        borderRadius: "8px",
        padding: "1rem",
        backgroundColor: "var(--panel-2)",
        marginBottom: "0.75rem",
      }}
    >
      {/* Title */}
      <h4 style={{ margin: "0 0 0.5rem 0", color: "var(--text)", fontSize: "1rem" }}>
        {result.title}
      </h4>

      {/* Metadata row */}
      <div
        style={{
          display: "flex",
          gap: "1rem",
          fontSize: "0.85rem",
          color: "var(--muted)",
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
            color: "var(--accent)",
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
                backgroundColor: "var(--panel-2)",
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

      {/* Rationale preview */}
      {rationalePreview && (
        <div
          style={{
            fontSize: "0.85rem",
            color: "var(--muted)",
            fontStyle: "italic",
            marginBottom: "0.75rem",
            paddingLeft: "0.5rem",
            borderLeft: "2px solid var(--border)",
          }}
        >
          {rationalePreview}
        </div>
      )}

      {/* Action bar */}
      <ActionBar
        itemId={item.id}
        currentStatus={item.status}
        onMarkDone={onMarkDone}
        onMoveToActive={onMoveToActive}
        onMoveToFollowUp={onMoveToFollowUp}
      />
    </div>
  );
}
