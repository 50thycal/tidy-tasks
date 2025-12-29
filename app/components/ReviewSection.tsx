import { useState } from "react";
import type { InboxItem } from "@/src/lib/clientStore";
import ReviewItemRow from "./ReviewItemRow";

interface ReviewSectionProps {
  title: string;
  items: InboxItem[];
  defaultExpanded?: boolean;
  onMarkDone: (id: string) => void;
  onMoveToActive: (id: string) => void;
  onMoveToFollowUp: (id: string) => void;
  onSnooze: (id: string, days: number) => void;
  onUnsnooze: (id: string) => void;
}

export default function ReviewSection({
  title,
  items,
  defaultExpanded = true,
  onMarkDone,
  onMoveToActive,
  onMoveToFollowUp,
  onSnooze,
  onUnsnooze,
}: ReviewSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  // Calculate total effort
  const totalEffort = items.reduce((sum, item) => {
    return sum + (item.result.effort_min || 0);
  }, 0);

  return (
    <div
      style={{
        backgroundColor: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: "8px",
        padding: "1.5rem",
        marginBottom: "1.5rem",
      }}
    >
      {/* Section header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: expanded ? "1rem" : 0,
          cursor: "pointer",
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <h2
            style={{
              margin: 0,
              fontSize: "1.25rem",
              color: "var(--text)",
              fontWeight: "600",
            }}
          >
            {expanded ? "▼" : "▶"} {title}
          </h2>
          <span
            style={{
              padding: "0.25rem 0.75rem",
              backgroundColor: items.length > 0 ? "color-mix(in srgb, var(--accent) 15%, transparent)" : "var(--panel-2)",
              color: items.length > 0 ? "var(--accent)" : "var(--muted)",
              borderRadius: "12px",
              fontSize: "0.85rem",
              fontWeight: "500",
            }}
          >
            {items.length}
          </span>
          {totalEffort > 0 && (
            <span
              style={{
                fontSize: "0.85rem",
                color: "var(--muted)",
              }}
            >
              ⏱️ {totalEffort} min
            </span>
          )}
        </div>
      </div>

      {/* Section content */}
      {expanded && (
        <div>
          {items.length === 0 ? (
            <div
              style={{
                padding: "2rem",
                textAlign: "center",
                color: "var(--muted)",
                fontSize: "0.9rem",
              }}
            >
              No items in this section
            </div>
          ) : (
            items.map((item) => (
              <ReviewItemRow
                key={item.id}
                item={item}
                onMarkDone={onMarkDone}
                onMoveToActive={onMoveToActive}
                onMoveToFollowUp={onMoveToFollowUp}
                onSnooze={onSnooze}
                onUnsnooze={onUnsnooze}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
