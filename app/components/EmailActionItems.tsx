"use client";

import { useState } from "react";
import type { ParseEmailResponse, EmailActionItem } from "@/types/api";

export interface EmailResult {
  id: string;
  fileName: string;
  status: "processing" | "success" | "failed";
  data?: ParseEmailResponse;
  error?: string;
}

interface EmailActionItemsProps {
  results: EmailResult[];
  onAddToInbox: (
    items: Array<{
      actionItem: EmailActionItem;
      emailMeta: { sender: string; subject: string; email_date: string | null };
    }>,
    destination: "active" | "follow-up"
  ) => void;
  onDismiss: (resultId: string) => void;
}

export default function EmailActionItems({
  results,
  onAddToInbox,
  onDismiss,
}: EmailActionItemsProps) {
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [addedItems, setAddedItems] = useState<Set<string>>(new Set());

  const successResults = results.filter(
    (r) => r.status === "success" && r.data
  );
  const processingResults = results.filter((r) => r.status === "processing");
  const failedResults = results.filter((r) => r.status === "failed");

  // Build a flat list of all action items with their parent email metadata
  const allItems: Array<{
    key: string;
    resultId: string;
    actionItem: EmailActionItem;
    emailMeta: { sender: string; subject: string; email_date: string | null };
  }> = [];

  for (const result of successResults) {
    if (!result.data) continue;
    result.data.action_items.forEach((item, idx) => {
      allItems.push({
        key: `${result.id}-${idx}`,
        resultId: result.id,
        actionItem: item,
        emailMeta: {
          sender: result.data!.sender,
          subject: result.data!.subject,
          email_date: result.data!.email_date,
        },
      });
    });
  }

  const visibleItems = allItems.filter((i) => !addedItems.has(i.key));
  const mineItems = visibleItems.filter((i) => i.actionItem.owner === "mine");
  const theirsItems = visibleItems.filter((i) => i.actionItem.owner === "theirs");

  const toggleSelect = (key: string) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAllMine = () => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      mineItems.forEach((i) => next.add(i.key));
      return next;
    });
  };

  const selectAllTheirs = () => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      theirsItems.forEach((i) => next.add(i.key));
      return next;
    });
  };

  const handleAddSelected = (destination: "active" | "follow-up") => {
    const selected = visibleItems.filter((i) => selectedItems.has(i.key));
    if (selected.length === 0) return;

    onAddToInbox(
      selected.map((s) => ({
        actionItem: s.actionItem,
        emailMeta: s.emailMeta,
      })),
      destination
    );

    // Mark items as added and clear from selection
    setAddedItems((prev) => {
      const next = new Set(prev);
      selected.forEach((s) => next.add(s.key));
      return next;
    });
    setSelectedItems((prev) => {
      const next = new Set(prev);
      selected.forEach((s) => next.delete(s.key));
      return next;
    });
  };

  const handleAddAllMine = () => {
    if (mineItems.length === 0) return;
    onAddToInbox(
      mineItems.map((i) => ({
        actionItem: i.actionItem,
        emailMeta: i.emailMeta,
      })),
      "active"
    );
    setAddedItems((prev) => {
      const next = new Set(prev);
      mineItems.forEach((i) => next.add(i.key));
      return next;
    });
  };

  const handleAddAllTheirs = () => {
    if (theirsItems.length === 0) return;
    onAddToInbox(
      theirsItems.map((i) => ({
        actionItem: i.actionItem,
        emailMeta: i.emailMeta,
      })),
      "follow-up"
    );
    setAddedItems((prev) => {
      const next = new Set(prev);
      theirsItems.forEach((i) => next.add(i.key));
      return next;
    });
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  if (
    processingResults.length === 0 &&
    failedResults.length === 0 &&
    visibleItems.length === 0
  ) {
    return null;
  }

  return (
    <div style={{ marginTop: "2rem" }}>
      {/* Processing indicators */}
      {processingResults.map((r) => (
        <div
          key={r.id}
          className="card"
          style={{
            padding: "1rem",
            marginBottom: "1rem",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
          }}
        >
          <div
            style={{
              width: "20px",
              height: "20px",
              border: "2px solid var(--accent)",
              borderTopColor: "transparent",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
            }}
          />
          <div>
            <div style={{ fontWeight: "500", color: "var(--text)" }}>
              Processing: {r.fileName}
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
              Extracting action items...
            </div>
          </div>
        </div>
      ))}

      {/* Failed results */}
      {failedResults.map((r) => (
        <div
          key={r.id}
          className="card"
          style={{
            padding: "1rem",
            marginBottom: "1rem",
            borderColor: "color-mix(in srgb, #ef4444 30%, var(--border))",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontWeight: "500", color: "#ef4444" }}>
                Failed: {r.fileName}
              </div>
              <div
                style={{
                  fontSize: "0.8rem",
                  color: "var(--muted)",
                  marginTop: "0.25rem",
                }}
              >
                {r.error || "Unknown error"}
              </div>
            </div>
            <button
              onClick={() => onDismiss(r.id)}
              className="btn btn-muted"
              style={{ fontSize: "0.8rem" }}
            >
              Dismiss
            </button>
          </div>
        </div>
      ))}

      {/* No action items found */}
      {successResults.length > 0 && allItems.length === 0 && (
        <div
          className="card"
          style={{ padding: "2rem", textAlign: "center" }}
        >
          <div style={{ fontSize: "1.1rem", color: "var(--text)", marginBottom: "0.5rem" }}>
            No action items found
          </div>
          <div style={{ fontSize: "0.875rem", color: "var(--muted)" }}>
            The AI didn&apos;t detect any action items in the email(s). This email may be purely informational.
          </div>
        </div>
      )}

      {/* Your Action Items */}
      {mineItems.length > 0 && (
        <div style={{ marginBottom: "2rem" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "0.75rem",
            }}
          >
            <h3 style={{ margin: 0, fontSize: "1rem", color: "var(--text)" }}>
              Your Action Items ({mineItems.length})
            </h3>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                onClick={selectAllMine}
                className="btn btn-muted"
                style={{ fontSize: "0.8rem" }}
              >
                Select All
              </button>
              <button
                onClick={handleAddAllMine}
                className="btn btn-primary"
                style={{ fontSize: "0.8rem" }}
              >
                Add All to Active
              </button>
            </div>
          </div>

          {mineItems.map((item) => (
            <ActionItemCard
              key={item.key}
              item={item.actionItem}
              emailMeta={item.emailMeta}
              isSelected={selectedItems.has(item.key)}
              onToggleSelect={() => toggleSelect(item.key)}
              formatDate={formatDate}
            />
          ))}
        </div>
      )}

      {/* Waiting On (Theirs) */}
      {theirsItems.length > 0 && (
        <div style={{ marginBottom: "2rem" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "0.75rem",
            }}
          >
            <h3 style={{ margin: 0, fontSize: "1rem", color: "var(--text)" }}>
              Waiting On ({theirsItems.length})
            </h3>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                onClick={selectAllTheirs}
                className="btn btn-muted"
                style={{ fontSize: "0.8rem" }}
              >
                Select All
              </button>
              <button
                onClick={handleAddAllTheirs}
                className="btn btn-primary"
                style={{ fontSize: "0.8rem" }}
              >
                Add All to Follow-up
              </button>
            </div>
          </div>

          {theirsItems.map((item) => (
            <ActionItemCard
              key={item.key}
              item={item.actionItem}
              emailMeta={item.emailMeta}
              isSelected={selectedItems.has(item.key)}
              onToggleSelect={() => toggleSelect(item.key)}
              formatDate={formatDate}
              isFollowUp
            />
          ))}
        </div>
      )}

      {/* Bulk action bar for selected items */}
      {selectedItems.size > 0 && (
        <div
          style={{
            position: "sticky",
            bottom: "1rem",
            padding: "0.75rem 1rem",
            backgroundColor: "var(--panel-2)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
          }}
        >
          <span style={{ fontSize: "0.875rem", color: "var(--text)" }}>
            {selectedItems.size} selected
          </span>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              onClick={() => setSelectedItems(new Set())}
              className="btn btn-muted"
              style={{ fontSize: "0.8rem" }}
            >
              Clear
            </button>
            <button
              onClick={() => handleAddSelected("active")}
              className="btn btn-muted"
              style={{ fontSize: "0.8rem" }}
            >
              Add to Active
            </button>
            <button
              onClick={() => handleAddSelected("follow-up")}
              className="btn btn-primary"
              style={{ fontSize: "0.8rem" }}
            >
              Add to Follow-up
            </button>
          </div>
        </div>
      )}

      {/* Spinner animation */}
      <style jsx global>{`
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}

/** Individual action item card */
function ActionItemCard({
  item,
  emailMeta,
  isSelected,
  onToggleSelect,
  formatDate,
  isFollowUp = false,
}: {
  item: EmailActionItem;
  emailMeta: { sender: string; subject: string; email_date: string | null };
  isSelected: boolean;
  onToggleSelect: () => void;
  formatDate: (d: string | null) => string | null;
  isFollowUp?: boolean;
}) {
  const effortLabels: Record<number, string> = {
    5: "5m",
    15: "15m",
    30: "30m",
    60: "1h",
    90: "1.5h",
    120: "2h",
  };

  const dateLabel = isFollowUp
    ? formatDate(item.follow_up_by)
    : formatDate(item.due_at);

  return (
    <div
      className="card"
      style={{
        padding: "0.875rem 1rem",
        marginBottom: "0.5rem",
        display: "flex",
        gap: "0.75rem",
        alignItems: "flex-start",
        borderColor: isSelected
          ? "var(--accent)"
          : "var(--border)",
        transition: "border-color 0.15s",
      }}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={onToggleSelect}
        style={{
          width: "16px",
          height: "16px",
          marginTop: "0.125rem",
          cursor: "pointer",
          accentColor: "var(--accent)",
          flexShrink: 0,
        }}
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Title */}
        <div
          style={{
            fontWeight: "500",
            fontSize: "0.95rem",
            color: "var(--text)",
            marginBottom: "0.375rem",
          }}
        >
          {item.title}
        </div>

        {/* Meta row */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.5rem",
            alignItems: "center",
            fontSize: "0.8rem",
          }}
        >
          {/* Contact */}
          <span
            style={{
              padding: "0.125rem 0.5rem",
              backgroundColor: isFollowUp
                ? "color-mix(in srgb, var(--accent) 15%, transparent)"
                : "color-mix(in srgb, var(--accent-2) 15%, transparent)",
              color: isFollowUp ? "var(--accent)" : "var(--accent-2)",
              borderRadius: "10px",
              fontWeight: "500",
            }}
          >
            {isFollowUp ? `Waiting on: ${item.contact}` : item.contact}
          </span>

          {/* Date */}
          {dateLabel && (
            <span style={{ color: "var(--muted)" }}>
              {isFollowUp ? `Follow up: ${dateLabel}` : `Due: ${dateLabel}`}
            </span>
          )}

          {/* Effort */}
          <span style={{ color: "var(--muted)" }}>
            {effortLabels[item.effort_min] || `${item.effort_min}m`}
          </span>

          {/* Energy */}
          <span style={{ color: "var(--muted)" }}>
            {item.energy === "high" ? "High energy" : item.energy === "low" ? "Low energy" : "Med energy"}
          </span>

          {/* Project */}
          {item.project && (
            <span
              style={{
                padding: "0.125rem 0.5rem",
                backgroundColor: "color-mix(in srgb, var(--accent-2) 20%, transparent)",
                color: "var(--accent-2)",
                borderRadius: "10px",
              }}
            >
              {item.project}
            </span>
          )}
        </div>

        {/* Notes from email context */}
        {item.notes && (
          <div
            style={{
              marginTop: "0.375rem",
              fontSize: "0.8rem",
              color: "var(--muted)",
              fontStyle: "italic",
            }}
          >
            {item.notes}
          </div>
        )}

        {/* Email source */}
        <div
          style={{
            marginTop: "0.375rem",
            fontSize: "0.75rem",
            color: "var(--muted)",
            opacity: 0.7,
          }}
        >
          From: {emailMeta.sender} — Re: {emailMeta.subject}
        </div>
      </div>

      {/* Importance indicator */}
      <div
        style={{
          fontSize: "0.75rem",
          fontWeight: "600",
          color:
            item.importance >= 80
              ? "#ef4444"
              : item.importance >= 60
              ? "var(--accent)"
              : "var(--muted)",
          flexShrink: 0,
        }}
        title={`Importance: ${item.importance}/100`}
      >
        {item.importance}
      </div>
    </div>
  );
}
