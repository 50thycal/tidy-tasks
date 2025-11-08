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
import WeeklySummary from "@/app/components/WeeklySummary";
import NotifyBanner from "@/app/components/NotifyBanner";
import type { WeeklySummaryTask } from "@/src/types";
import { useMetrics } from "@/src/hooks/useMetrics";
import { buildDigest, formatNotificationTitle, formatNotificationBody, type Digest } from "@/src/lib/digest";
import { notify, showInAppToast, getPermission } from "@/src/lib/notify";
import { saveDigest, getTodayDigest, markSeen } from "@/src/db/digest";

export default function ReviewPage() {
  const [mounted, setMounted] = useState(false);
  const [items, setItems] = useState<InboxItem[]>([]);
  const [expandAll, setExpandAll] = useState(true);
  const { metrics } = useMetrics();
  const [todayDigest, setTodayDigest] = useState<Digest | null>(null);

  useEffect(() => {
    setMounted(true);
    loadItems();
    // Load today's digest if exists
    const settings = getWorkSettings();
    const digest = getTodayDigest(settings.timezone);
    if (digest) {
      setTodayDigest({
        ts: digest.createdAt,
        date: digest.id,
        label: `Daily Digest — ${new Date(digest.createdAt).toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
        })}`,
        counts: digest.counts,
        examples: { overdue: [], dueToday: [] },
        text: digest.text,
      });
    }
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

  const handleSendDigestNow = () => {
    const settings = getWorkSettings();
    const now = new Date();
    const digest = buildDigest(now, settings, items);

    // Save digest
    saveDigest(digest);
    setTodayDigest(digest);

    // Show notification if permission granted
    const permission = getPermission();
    if (permission === "granted" && settings.notifications?.enabled) {
      const title = formatNotificationTitle(digest);
      const body = formatNotificationBody(digest);
      notify(title, body, {
        data: { url: "/review?digest=today" },
      });
    } else {
      // Fallback to in-app toast
      showInAppToast(digest.text);
    }
  };

  // Get work settings for week anchor
  const settings = useMemo(() => getWorkSettings(), []);
  const now = new Date();
  const weekRange = useMemo(
    () => formatWeekRange(now, settings.eowAnchor || "Mon"),
    []
  );

  // Convert items to WeeklySummaryTask format for summary API
  const summaryTasks: WeeklySummaryTask[] = useMemo(() => {
    return items.map((item) => ({
      id: item.id,
      title: item.result.title,
      project: item.result.project,
      effort_min: item.result.effort_min,
      tags: item.result.tags,
      importance: item.result.importance,
      status: item.status,
      due_at: item.result.due_at,
      created_at: item.created_at,
      updated_at: item.touched_at || item.created_at,
    }));
  }, [items]);

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
        {/* Notification Banner */}
        <NotifyBanner />

        {/* Header */}
        <div style={{ marginBottom: "2rem" }}>
          <h1 style={{ marginBottom: "0.5rem", fontSize: "1.875rem" }}>Weekly Review & Reflection</h1>
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

          {/* Metrics totals strip */}
          <div
            style={{
              padding: "0.75rem 1rem",
              fontSize: "0.85rem",
              color: "var(--muted)",
              textAlign: "center",
              marginBottom: "1rem",
            }}
          >
            Totals — Created {metrics.tasksCreated} · Done {metrics.tasksCompleted} · AI Cleans {metrics.aiCleans} · AI Prioritizations {metrics.aiPrioritizations}
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

        {/* Daily Digest */}
        {todayDigest && (
          <div
            style={{
              backgroundColor: "var(--panel)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              padding: "1.5rem",
              marginBottom: "2rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h2 style={{ fontSize: "1.25rem", fontWeight: "600", color: "var(--text)", margin: 0 }}>
                {todayDigest.label}
              </h2>
              <button
                onClick={handleSendDigestNow}
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
                Refresh Digest
              </button>
            </div>

            <div style={{ fontSize: "0.95rem", color: "var(--text)", marginBottom: "1rem" }}>
              {todayDigest.text}
            </div>

            <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
              {todayDigest.counts.overdue > 0 && (
                <div style={{ padding: "0.5rem 1rem", backgroundColor: "color-mix(in srgb, var(--danger) 15%, transparent)", borderRadius: "4px", border: "1px solid var(--danger)", fontSize: "0.85rem" }}>
                  <strong>{todayDigest.counts.overdue}</strong> overdue
                </div>
              )}
              {todayDigest.counts.dueToday > 0 && (
                <div style={{ padding: "0.5rem 1rem", backgroundColor: "color-mix(in srgb, var(--accent) 15%, transparent)", borderRadius: "4px", border: "1px solid var(--accent)", fontSize: "0.85rem" }}>
                  <strong>{todayDigest.counts.dueToday}</strong> due today
                </div>
              )}
              {todayDigest.counts.dueNext7 > 0 && (
                <div style={{ padding: "0.5rem 1rem", backgroundColor: "color-mix(in srgb, var(--accent-2) 15%, transparent)", borderRadius: "4px", border: "1px solid var(--accent-2)", fontSize: "0.85rem" }}>
                  <strong>{todayDigest.counts.dueNext7}</strong> due next 7 days
                </div>
              )}
              {todayDigest.counts.staleActive > 0 && (
                <div style={{ padding: "0.5rem 1rem", backgroundColor: "color-mix(in srgb, var(--warn) 15%, transparent)", borderRadius: "4px", border: "1px solid var(--warn)", fontSize: "0.85rem" }}>
                  <strong>{todayDigest.counts.staleActive}</strong> stale active
                </div>
              )}
            </div>
          </div>
        )}

        {/* Weekly Summary */}
        <WeeklySummary tasks={summaryTasks} />

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
