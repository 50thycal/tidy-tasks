"use client";

import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { PrioritizedItem } from "@/src/types";
import type { InboxItem } from "@/src/lib/clientStore";
import DraggableTaskCard from "@/app/components/DraggableTaskCard";

interface FocusBucketProps {
  bucket: "Now" | "Next" | "Later" | "Backlog";
  itemIds: string[]; // Ordered list of task IDs
  prioritizedItems: PrioritizedItem[]; // AI metadata (score, rationale)
  inboxItems: InboxItem[]; // Full task data
  onMarkDone: (id: string) => void;
  onMoveToInbox: (id: string) => void;
  onRefresh?: () => void;
  onSendTo?: (taskId: string, targetBucket: "now" | "next" | "later" | "backlog") => void;
  onResetToAI?: () => void;
}

export default function FocusBucket({
  bucket,
  itemIds,
  prioritizedItems,
  inboxItems,
  onMarkDone,
  onMoveToInbox,
  onRefresh,
  onSendTo,
  onResetToAI,
}: FocusBucketProps) {
  const bucketColors: Record<string, string> = {
    Now: "#4caf50",
    Next: "#2196f3",
    Later: "#ff9800",
    Backlog: "#9e9e9e",
  };

  const bucketColor = bucketColors[bucket] || "#9e9e9e";

  // Don't render empty buckets, but show a placeholder if drag-drop is active
  if (itemIds.length === 0) {
    return (
      <div style={{ marginBottom: "2rem" }}>
        <h3
          style={{
            color: bucketColor,
            marginBottom: "1rem",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span
              style={{
                width: "8px",
                height: "8px",
                backgroundColor: bucketColor,
                borderRadius: "50%",
                display: "inline-block",
              }}
            />
            {bucket} (0)
          </div>
        </h3>
        <div
          style={{
            padding: "2rem",
            textAlign: "center",
            backgroundColor: "var(--panel-2)",
            borderRadius: "8px",
            border: "1px dashed var(--border)",
            color: "var(--muted)",
            fontSize: "0.9rem",
          }}
        >
          Drag items here or use &quot;Send to...&quot;
        </div>
      </div>
    );
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
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span
            style={{
              width: "8px",
              height: "8px",
              backgroundColor: bucketColor,
              borderRadius: "50%",
              display: "inline-block",
            }}
          />
          {bucket} ({itemIds.length})
        </div>

        {/* Reset to AI order button */}
        {onResetToAI && (
          <button
            onClick={onResetToAI}
            style={{
              fontSize: "0.75rem",
              color: "var(--muted)",
              background: "none",
              border: "none",
              cursor: "pointer",
              textDecoration: "underline",
              padding: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--accent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--muted)";
            }}
          >
            Reset to AI order
          </button>
        )}
      </h3>

      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {itemIds.map((taskId) => {
            const inboxItem = inboxItems.find((i) => i.id === taskId);
            if (!inboxItem) return null;

            // Find AI metadata for this task
            const aiData = prioritizedItems.find((p) => p.id === taskId);

            return (
              <DraggableTaskCard
                key={taskId}
                id={taskId}
                inboxItem={inboxItem}
                rationale={aiData?.rationale}
                priorityScore={aiData?.priority_score}
                bucketColor={bucketColor}
                onMarkDone={() => onMarkDone(taskId)}
                onMoveToInbox={() => onMoveToInbox(taskId)}
                onRefresh={onRefresh}
                onSendTo={onSendTo ? (targetBucket) => onSendTo(taskId, targetBucket) : undefined}
              />
            );
          })}
        </div>
      </SortableContext>
    </div>
  );
}
