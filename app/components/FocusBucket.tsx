import type { PrioritizedItem } from "@/src/types";
import type { InboxItem } from "@/src/lib/clientStore";
import { getInboxItems } from "@/src/lib/clientStore";
import TaskCard from "@/app/components/TaskCard";

interface FocusBucketProps {
  bucket: "Now" | "Next" | "Later" | "Backlog";
  items: PrioritizedItem[];
  inboxItems: InboxItem[];
  onMarkDone: (id: string) => void;
  onMoveToInbox: (id: string) => void;
  onRefresh?: () => void; // Optional callback to refresh parent data after edit
}

export default function FocusBucket({
  bucket,
  items,
  inboxItems,
  onMarkDone,
  onMoveToInbox,
  onRefresh,
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
            <div key={item.id}>
              {/* Priority score and rationale banner */}
              <div
                style={{
                  padding: "0.75rem 1rem",
                  backgroundColor: "color-mix(in srgb, " + bucketColor + " 15%, transparent)",
                  borderRadius: "8px 8px 0 0",
                  border: "1px solid var(--border)",
                  borderBottom: "none",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <p
                  style={{
                    fontSize: "0.9rem",
                    color: "var(--muted)",
                    margin: 0,
                    fontStyle: "italic",
                    flex: 1,
                  }}
                >
                  {item.rationale}
                </p>
                <span
                  style={{
                    fontSize: "0.9rem",
                    fontWeight: "600",
                    color: bucketColor,
                    marginLeft: "1rem",
                  }}
                >
                  Score: {item.priority_score}
                </span>
              </div>

              {/* TaskCard with edit capability */}
              <div style={{ borderRadius: "0 0 8px 8px", overflow: "hidden" }}>
                <TaskCard
                  id={inboxItem.id}
                  result={inboxItem.result}
                  showActions={false}
                  onChange={() => onRefresh?.()}
                />
              </div>

              {/* Focus-specific actions */}
              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  marginTop: "0.5rem",
                  paddingLeft: "1rem",
                }}
              >
                <button
                  onClick={() => onMarkDone(item.id)}
                  style={{
                    padding: "0.5rem 1rem",
                    backgroundColor: "var(--accent-2)",
                    color: "white",
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
                    backgroundColor: "var(--panel-2)",
                    color: "var(--text)",
                    border: "1px solid var(--border)",
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
