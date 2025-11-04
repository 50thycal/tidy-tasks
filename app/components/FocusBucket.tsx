import type { PrioritizedItem } from "@/src/types";
import type { InboxItem } from "@/src/lib/clientStore";

interface FocusBucketProps {
  bucket: "Now" | "Next" | "Later" | "Backlog";
  items: PrioritizedItem[];
  inboxItems: InboxItem[];
  onMarkDone: (id: string) => void;
  onMoveToInbox: (id: string) => void;
}

export default function FocusBucket({
  bucket,
  items,
  inboxItems,
  onMarkDone,
  onMoveToInbox,
}: FocusBucketProps) {
  const bucketColors: Record<string, string> = {
    Now: "#4caf50",
    Next: "#2196f3",
    Later: "#ff9800",
    Backlog: "#9e9e9e",
  };

  const bucketColor = bucketColors[bucket] || "#9e9e9e";

  if (items.length === 0) {
    return null; // Don't render empty buckets
  }

  return (
    <div style={{ marginBottom: "2rem" }}>
      <h3
        style={{
          color: bucketColor,
          marginBottom: "1rem",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
        }}
      >
        <span
          style={{
            width: "8px",
            height: "8px",
            backgroundColor: bucketColor,
            borderRadius: "50%",
            display: "inline-block",
          }}
        />
        {bucket} ({items.length})
      </h3>

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {items.map((item) => {
          const inboxItem = inboxItems.find((i) => i.id === item.id);
          if (!inboxItem) return null;

          return (
            <div
              key={item.id}
              style={{
                border: "1px solid #ddd",
                borderRadius: "8px",
                padding: "1rem",
                backgroundColor: "#fff",
                color: "#111",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: "0.5rem",
                }}
              >
                <h4 style={{ margin: 0, color: "#111", flex: 1 }}>
                  {inboxItem.result.title}
                </h4>
                <span
                  style={{
                    fontSize: "0.9rem",
                    fontWeight: "600",
                    color: bucketColor,
                    marginLeft: "0.5rem",
                  }}
                >
                  {item.priority_score}
                </span>
              </div>

              <p
                style={{
                  fontSize: "0.9rem",
                  color: "#666",
                  margin: "0.5rem 0",
                  fontStyle: "italic",
                }}
              >
                {item.rationale}
              </p>

              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  fontSize: "0.85rem",
                  color: "#666",
                  marginBottom: "0.75rem",
                }}
              >
                {inboxItem.result.effort_min && (
                  <span>⏱️ {inboxItem.result.effort_min} min</span>
                )}
                {inboxItem.result.energy && (
                  <span>⚡ {inboxItem.result.energy}</span>
                )}
                {inboxItem.result.due_at && (
                  <span>
                    📅 {new Date(inboxItem.result.due_at).toLocaleDateString()}
                  </span>
                )}
              </div>

              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  onClick={() => onMarkDone(item.id)}
                  style={{
                    padding: "0.5rem 1rem",
                    backgroundColor: "#4caf50",
                    color: "#fff",
                    border: "none",
                    borderRadius: "4px",
                    fontSize: "0.85rem",
                    cursor: "pointer",
                  }}
                >
                  ✓ Mark Done
                </button>
                <button
                  onClick={() => onMoveToInbox(item.id)}
                  style={{
                    padding: "0.5rem 1rem",
                    backgroundColor: "#fff",
                    color: "#666",
                    border: "1px solid #ccc",
                    borderRadius: "4px",
                    fontSize: "0.85rem",
                    cursor: "pointer",
                  }}
                >
                  ← Move to Inbox
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
