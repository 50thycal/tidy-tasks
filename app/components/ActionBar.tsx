interface ActionBarProps {
  itemId: string;
  currentStatus: "active" | "done" | "follow-up";
  onMarkDone: (id: string) => void;
  onMoveToActive: (id: string) => void;
  onMoveToFollowUp: (id: string) => void;
}

export default function ActionBar({
  itemId,
  currentStatus,
  onMarkDone,
  onMoveToActive,
  onMoveToFollowUp,
}: ActionBarProps) {
  return (
    <div
      style={{
        display: "flex",
        gap: "0.5rem",
        flexWrap: "wrap",
        alignItems: "center",
      }}
    >
      {/* Mark Done */}
      {currentStatus !== "done" && (
        <button
          onClick={() => onMarkDone(itemId)}
          style={{
            padding: "0.375rem 0.75rem",
            backgroundColor: "var(--accent-2)",
            color: "white",
            border: "none",
            borderRadius: "4px",
            fontSize: "0.85rem",
            cursor: "pointer",
          }}
          title="Mark as done (d)"
        >
          ✓ Done
        </button>
      )}

      {/* Move to Active */}
      {currentStatus !== "active" && currentStatus !== "done" && (
        <button
          onClick={() => onMoveToActive(itemId)}
          style={{
            padding: "0.375rem 0.75rem",
            backgroundColor: "var(--accent)",
            color: "white",
            border: "none",
            borderRadius: "4px",
            fontSize: "0.85rem",
            cursor: "pointer",
          }}
          title="Move to Active (a)"
        >
          → Active
        </button>
      )}

      {/* Move to Follow-up */}
      {currentStatus !== "follow-up" && currentStatus !== "done" && (
        <button
          onClick={() => onMoveToFollowUp(itemId)}
          style={{
            padding: "0.375rem 0.75rem",
            backgroundColor: "var(--muted)",
            color: "white",
            border: "none",
            borderRadius: "4px",
            fontSize: "0.85rem",
            cursor: "pointer",
          }}
          title="Move to Follow-up (waiting on others)"
        >
          ⏳ Follow-up
        </button>
      )}
    </div>
  );
}
