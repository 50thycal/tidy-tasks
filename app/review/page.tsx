"use client";

import { useState, useEffect, useMemo } from "react";
import {
  getInboxItems,
  markItemDone,
  moveItemToActive,
  moveItemToInbox,
  snoozeItem,
  unsnoozeItem,
  type InboxItem,
} from "@/src/lib/clientStore";
import { getWorkSettings } from "@/src/lib/settings";
import {
  isPast,
  isThisWeek,
  isStale,
  formatWeekRange,
} from "@/src/lib/reviewUtils";
import ReviewSection from "@/app/components/ReviewSection";

export default function ReviewPage() {
  const [mounted, setMounted] = useState(false);
  const [items, setItems] = useState<InboxItem[]>([]);
  const [expandAll, setExpandAll] = useState(true);

  useEffect(() => {
    setMounted(true);
    loadItems();
  }, []);

  const loadItems = () => {
    const allItems = getInboxItems();
    setItems(allItems);
  };

  const handleMarkDone = (id: string) => {
    markItemDone(id);
    loadItems();
  };

  const handleMoveToActive = (id: string) => {
    moveItemToActive(id);
    loadItems();
  };

  const handleMoveToInbox = (id: string) => {
    moveItemToInbox(id);
    loadItems();
  };

  const handleSnooze = (id: string, days: number) => {
    snoozeItem(id, days);
    loadItems();
  };

  const handleUnsnooze = (id: string) => {
    unsnoozeItem(id);
    loadItems();
  };

  const handleExpandAll = () => {
    setExpandAll(true);
  };

  const handleCollapseAll = () => {
    setExpandAll(false);
  };

  // Get work settings for week anchor
  const settings = useMemo(() => getWorkSettings(), []);
  const now = new Date();
  const weekRange = useMemo(
    () => formatWeekRange(now, settings.eowAnchor || "Mon"),
    []
  );

  // Filter items into sections
  const sections = useMemo(() => {
    const overdue: InboxItem[] = [];
    const dueThisWeek: InboxItem[] = [];
    const staleActive: InboxItem[] = [];
    const completedThisWeek: InboxItem[] = [];
    const snoozed: InboxItem[] = [];

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    items.forEach((item) => {
      // Snoozed section
      if (item.status === "snoozed") {
        snoozed.push(item);
        return;
      }

      // Completed this week section
      if (item.status === "done") {
        const touchedDate = new Date(item.touched_at || item.created_at);
        if (touchedDate >= sevenDaysAgo) {
          completedThisWeek.push(item);
        }
        return;
      }

      // Stale active section
      if (
        item.status === "active" &&
        isStale(item.touched_at, item.created_at, 7)
      ) {
        staleActive.push(item);
        return;
      }

      // Overdue section
      if (item.result.due_at && isPast(item.result.due_at)) {
        overdue.push(item);
        return;
      }

      // Due this week section
      if (
        item.result.due_at &&
        isThisWeek(item.result.due_at, now, settings.eowAnchor || "Mon")
      ) {
        dueThisWeek.push(item);
        return;
      }
    });

    return {
      overdue,
      dueThisWeek,
      staleActive,
      completedThisWeek,
      snoozed,
    };
  }, [items, settings.eowAnchor]);

  if (!mounted) {
    return (
      <div style={{ padding: "2rem" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <h1>Weekly Review</h1>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "2rem", minHeight: "100vh" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: "2rem" }}>
          <h1 style={{ marginBottom: "0.5rem" }}>Weekly Review & Reflection</h1>
          <p style={{ color: "var(--muted)", marginBottom: "1.5rem" }}>
            Review your tasks and keep your workflow tidy
          </p>

          {/* Metrics summary */}
          <div
            style={{
              display: "flex",
              gap: "1.5rem",
              flexWrap: "wrap",
              marginBottom: "1.5rem",
            }}
          >
            <div
              style={{
                padding: "0.75rem 1.25rem",
                backgroundColor: sections.overdue.length > 0 ? "color-mix(in srgb, var(--danger) 15%, transparent)" : "var(--panel-2)",
                borderRadius: "8px",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                border: "1px solid var(--border)",
              }}
            >
              <span style={{ fontSize: "1.5rem" }}>⚠️</span>
              <div>
                <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>Overdue</div>
                <div
                  style={{
                    fontSize: "1.25rem",
                    fontWeight: "600",
                    color: sections.overdue.length > 0 ? "var(--danger)" : "var(--muted)",
                  }}
                >
                  {sections.overdue.length}
                </div>
              </div>
            </div>

            <div
              style={{
                padding: "0.75rem 1.25rem",
                backgroundColor: "color-mix(in srgb, var(--accent) 15%, transparent)",
                borderRadius: "8px",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                border: "1px solid var(--border)",
              }}
            >
              <span style={{ fontSize: "1.5rem" }}>📅</span>
              <div>
                <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>Due This Week</div>
                <div style={{ fontSize: "1.25rem", fontWeight: "600", color: "var(--accent)" }}>
                  {sections.dueThisWeek.length}
                </div>
              </div>
            </div>

            <div
              style={{
                padding: "0.75rem 1.25rem",
                backgroundColor: sections.staleActive.length > 0 ? "color-mix(in srgb, var(--warn) 15%, transparent)" : "var(--panel-2)",
                borderRadius: "8px",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                border: "1px solid var(--border)",
              }}
            >
              <span style={{ fontSize: "1.5rem" }}>⏰</span>
              <div>
                <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>Stale Active</div>
                <div
                  style={{
                    fontSize: "1.25rem",
                    fontWeight: "600",
                    color: sections.staleActive.length > 0 ? "var(--warn)" : "var(--muted)",
                  }}
                >
                  {sections.staleActive.length}
                </div>
              </div>
            </div>

            <div
              style={{
                padding: "0.75rem 1.25rem",
                backgroundColor: "color-mix(in srgb, var(--accent-2) 15%, transparent)",
                borderRadius: "8px",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                border: "1px solid var(--border)",
              }}
            >
              <span style={{ fontSize: "1.5rem" }}>✓</span>
              <div>
                <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>Done (7d)</div>
                <div style={{ fontSize: "1.25rem", fontWeight: "600", color: "var(--accent-2)" }}>
                  {sections.completedThisWeek.length}
                </div>
              </div>
            </div>
          </div>

          {/* Toolbar */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "1rem",
              backgroundColor: "var(--panel-2)",
              borderRadius: "8px",
              border: "1px solid var(--border)",
            }}
          >
            <div style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
              Week of {weekRange}
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                onClick={handleExpandAll}
                style={{
                  padding: "0.5rem 1rem",
                  backgroundColor: "var(--panel)",
                  color: "var(--text)",
                  border: "1px solid var(--border)",
                  borderRadius: "4px",
                  fontSize: "0.85rem",
                  cursor: "pointer",
                }}
              >
                Expand all
              </button>
              <button
                onClick={handleCollapseAll}
                style={{
                  padding: "0.5rem 1rem",
                  backgroundColor: "var(--panel)",
                  color: "var(--text)",
                  border: "1px solid var(--border)",
                  borderRadius: "4px",
                  fontSize: "0.85rem",
                  cursor: "pointer",
                }}
              >
                Collapse all
              </button>
            </div>
          </div>
        </div>

        {/* Sections */}
        <ReviewSection
          key={`overdue-${expandAll}`}
          title="Overdue"
          items={sections.overdue}
          defaultExpanded={expandAll}
          onMarkDone={handleMarkDone}
          onMoveToActive={handleMoveToActive}
          onMoveToInbox={handleMoveToInbox}
          onSnooze={handleSnooze}
          onUnsnooze={handleUnsnooze}
        />

        <ReviewSection
          key={`due-this-week-${expandAll}`}
          title="Due This Week"
          items={sections.dueThisWeek}
          defaultExpanded={expandAll}
          onMarkDone={handleMarkDone}
          onMoveToActive={handleMoveToActive}
          onMoveToInbox={handleMoveToInbox}
          onSnooze={handleSnooze}
          onUnsnooze={handleUnsnooze}
        />

        <ReviewSection
          key={`stale-active-${expandAll}`}
          title="Stale Active (7+ days)"
          items={sections.staleActive}
          defaultExpanded={expandAll}
          onMarkDone={handleMarkDone}
          onMoveToActive={handleMoveToActive}
          onMoveToInbox={handleMoveToInbox}
          onSnooze={handleSnooze}
          onUnsnooze={handleUnsnooze}
        />

        <ReviewSection
          key={`completed-${expandAll}`}
          title="Completed This Week"
          items={sections.completedThisWeek}
          defaultExpanded={expandAll}
          onMarkDone={handleMarkDone}
          onMoveToActive={handleMoveToActive}
          onMoveToInbox={handleMoveToInbox}
          onSnooze={handleSnooze}
          onUnsnooze={handleUnsnooze}
        />

        <ReviewSection
          key={`snoozed-${expandAll}`}
          title="Snoozed"
          items={sections.snoozed}
          defaultExpanded={expandAll}
          onMarkDone={handleMarkDone}
          onMoveToActive={handleMoveToActive}
          onMoveToInbox={handleMoveToInbox}
          onSnooze={handleSnooze}
          onUnsnooze={handleUnsnooze}
        />
      </div>
    </div>
  );
}
