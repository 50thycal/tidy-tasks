"use client";

import { useState, useEffect, useMemo } from "react";
import TaskCard from "@/app/components/TaskCard";
import SearchBar from "@/app/components/SearchBar";
import NotifyBanner from "@/app/components/NotifyBanner";
import InstallCTA from "@/app/components/InstallCTA";
import BulkBar from "@/app/components/BulkBar";
import { InlineCapture } from "@/app/components/InlineCapture";
import EmailDropZone from "@/app/components/EmailDropZone";
import EmailActionItems, { type EmailResult } from "@/app/components/EmailActionItems";
import {
  getInboxItems,
  updateInboxItemStatus,
  deleteInboxItem,
  bulkMarkDone,
  bulkMoveToBucket,
  bulkSetDue,
  bulkAddInboxItems,
  type InboxItem,
} from "@/src/lib/clientStore";
import { getWorkSettings, getWorkSettingsV2 } from "@/src/lib/settings";
import { applyFilters, DEFAULT_FILTERS, type Filters } from "@/src/lib/filter";
import { getDistinctProjects, getDistinctTags } from "@/src/db/queries";
import { getQuickDateActions } from "@/src/lib/quickdates";
import type { EmailActionItem, CleanTaskRequest, CleanTaskResponse } from "@/src/types";

type SortField = "created_at" | "due_at" | "project" | "importance" | "title";
type SortDirection = "asc" | "desc";

interface SortConfig {
  field: SortField;
  direction: SortDirection;
}

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: "created_at", label: "Created" },
  { value: "due_at", label: "Due Date" },
  { value: "project", label: "Project" },
  { value: "importance", label: "Importance" },
  { value: "title", label: "Title" },
];

export default function InboxPage() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [mounted, setMounted] = useState(false);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<SortConfig>({ field: "created_at", direction: "desc" });

  // Email upload state
  const [emailResults, setEmailResults] = useState<EmailResult[]>([]);
  const [isEmailProcessing, setIsEmailProcessing] = useState(false);
  const [emailToast, setEmailToast] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    setItems(getInboxItems());
  }, []);

  useEffect(() => {
    if (emailToast) {
      const timer = setTimeout(() => setEmailToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [emailToast]);

  const settings = getWorkSettings();

  const projects = useMemo(() => getDistinctProjects(), [items]);
  const tags = useMemo(() => getDistinctTags(), [items]);

  const filteredItems = useMemo(() => {
    return applyFilters(items, filters, settings);
  }, [items, filters, settings]);

  const sortItems = (itemsToSort: InboxItem[]): InboxItem[] => {
    return [...itemsToSort].sort((a, b) => {
      let comparison = 0;

      switch (sort.field) {
        case "created_at":
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
        case "due_at": {
          const aDue = a.result?.due_at ? new Date(a.result.due_at).getTime() : Infinity;
          const bDue = b.result?.due_at ? new Date(b.result.due_at).getTime() : Infinity;
          comparison = aDue - bDue;
          break;
        }
        case "project": {
          const aProject = a.result?.project || "";
          const bProject = b.result?.project || "";
          comparison = aProject.localeCompare(bProject);
          break;
        }
        case "importance":
          comparison = (a.result?.importance || 0) - (b.result?.importance || 0);
          break;
        case "title":
          comparison = (a.result?.title || "").localeCompare(b.result?.title || "");
          break;
      }

      return sort.direction === "asc" ? comparison : -comparison;
    });
  };

  const sortedItems = useMemo(() => {
    return sortItems(filteredItems);
  }, [filteredItems, sort]);

  const handleToggleDone = (id: string) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const newStatus = item.status === "done" ? "active" : "done";
    updateInboxItemStatus(id, newStatus);
    setItems(getInboxItems());
  };

  const handleMove = (id: string) => {
    updateInboxItemStatus(id, "active");
    setItems(getInboxItems());
  };

  const handleMoveToActive = (id: string) => {
    updateInboxItemStatus(id, "active");
    setItems(getInboxItems());
  };

  const handleDelete = (id: string) => {
    deleteInboxItem(id);
    setItems(getInboxItems());
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleBulkDone = async () => {
    await bulkMarkDone(Array.from(selectedIds));
    setSelectedIds(new Set());
    setItems(getInboxItems());
  };

  const handleBulkMove = (bucket: 'now' | 'next' | 'later' | 'backlog') => {
    bulkMoveToBucket(Array.from(selectedIds), bucket);
    setSelectedIds(new Set());
    setItems(getInboxItems());
  };

  const handleBulkDue = (preset: 'today' | 'tomorrow' | 'nextFriday' | 'clear') => {
    const actions = getQuickDateActions(settings, null);
    let dueAt: string | null = null;

    if (preset === 'today') dueAt = actions.today();
    else if (preset === 'tomorrow') dueAt = actions.tomorrow();
    else if (preset === 'nextFriday') dueAt = actions.nextFriday();
    else if (preset === 'clear') dueAt = null;

    bulkSetDue(Array.from(selectedIds), dueAt);
    setSelectedIds(new Set());
    setItems(getInboxItems());
  };

  const handleBulkCancel = () => {
    setSelectedIds(new Set());
  };

  // Email handlers
  const handleEmailsParsed = async (
    emails: Array<{ fileName: string; text: string }>
  ) => {
    setIsEmailProcessing(true);

    const emailSettings = getWorkSettings();
    const settingsV2 = getWorkSettingsV2();
    const today = new Date().toISOString().split("T")[0];

    const newResults: EmailResult[] = emails.map((email, idx) => ({
      id: `email-${Date.now()}-${idx}`,
      fileName: email.fileName,
      status: "processing" as const,
    }));

    setEmailResults((prev) => [...newResults, ...prev]);

    for (let i = 0; i < emails.length; i++) {
      const email = emails[i];
      const resultId = newResults[i].id;

      try {
        const response = await fetch("/api/ai/parse_email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email_text: email.text,
            today,
            timezone: emailSettings.timezone,
            settings: settingsV2,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        const data = await response.json();

        setEmailResults((prev) =>
          prev.map((r) =>
            r.id === resultId
              ? { ...r, status: "success" as const, data }
              : r
          )
        );
      } catch (err) {
        console.error(`Failed to process ${email.fileName}:`, err);
        setEmailResults((prev) =>
          prev.map((r) =>
            r.id === resultId
              ? {
                  ...r,
                  status: "failed" as const,
                  error: err instanceof Error ? err.message : "Unknown error",
                }
              : r
          )
        );
      }
    }

    setIsEmailProcessing(false);
  };

  const handleEmailAddToInbox = (
    emailItems: Array<{
      actionItem: EmailActionItem;
      emailMeta: {
        sender: string;
        subject: string;
        email_date: string | null;
      };
    }>,
    destination: "active" | "follow-up"
  ) => {
    const today = new Date().toISOString().split("T")[0];
    const emailSettings = getWorkSettings();

    const newItems: InboxItem[] = emailItems.map(({ actionItem, emailMeta }) => {
      const request: CleanTaskRequest = {
        raw_text: `[Email] ${actionItem.title} (from ${emailMeta.sender})`,
        today,
        timezone: emailSettings.timezone,
      };

      const result: CleanTaskResponse = {
        title: actionItem.title,
        due_at: actionItem.owner === "theirs" ? actionItem.follow_up_by : actionItem.due_at,
        effort_min: actionItem.effort_min,
        energy: actionItem.energy,
        tags: [
          ...actionItem.tags,
          "email",
          ...(actionItem.owner === "theirs" ? ["waiting"] : []),
        ],
        project: actionItem.project,
        subtasks: [],
        importance: actionItem.importance,
        notes_append: [
          actionItem.notes,
          `Contact: ${actionItem.contact}`,
          `Email: "${emailMeta.subject}" from ${emailMeta.sender}`,
        ]
          .filter(Boolean)
          .join("\n"),
      };

      return {
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        status: destination,
        request,
        result,
        email_context: {
          sender: emailMeta.sender,
          subject: emailMeta.subject,
          email_date: emailMeta.email_date,
          contact: actionItem.contact,
          follow_up_by: actionItem.follow_up_by,
        },
      };
    });

    try {
      bulkAddInboxItems(newItems);
      setItems(getInboxItems());
      setEmailToast(
        `Added ${newItems.length} ${newItems.length === 1 ? "task" : "tasks"} to ${
          destination === "follow-up" ? "Follow-up" : "Active"
        }`
      );
    } catch (error) {
      setEmailToast("Error adding tasks. Please try again.");
      console.error("Error adding tasks:", error);
    }
  };

  const handleEmailDismiss = (resultId: string) => {
    setEmailResults((prev) => prev.filter((r) => r.id !== resultId));
  };

  // Status counts
  const activeCount = items.filter((i) => i.status === "active").length;
  const followUpCount = items.filter((i) => i.status === "follow-up").length;
  const doneCount = items.filter((i) => i.status === "done").length;

  if (!mounted) {
    return (
      <div style={{ padding: "2rem" }}>
        <div style={{ maxWidth: "800px", margin: "0 auto" }}>
          <h1>Inbox</h1>
          <p style={{ color: "var(--muted)" }}>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Notification Banner */}
      <NotifyBanner />
      <InstallCTA />

      {/* Page Header */}
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ marginBottom: "0.5rem", fontSize: "1.75rem" }}>Inbox</h1>
        {items.length > 0 && (
          <div
            style={{
              display: "flex",
              gap: "0.75rem",
              fontSize: "0.85rem",
            }}
          >
            <span
              className="badge"
              style={{
                backgroundColor: "color-mix(in srgb, var(--accent-2) 15%, transparent)",
                color: "var(--accent-2)",
                border: "1px solid color-mix(in srgb, var(--accent-2) 30%, transparent)",
              }}
            >
              {activeCount} active
            </span>
            <span
              className="badge"
              style={{
                backgroundColor: "color-mix(in srgb, var(--warn) 15%, transparent)",
                color: "var(--warn)",
                border: "1px solid color-mix(in srgb, var(--warn) 30%, transparent)",
              }}
            >
              {followUpCount} follow-up
            </span>
            <span
              className="badge"
              style={{
                backgroundColor: "color-mix(in srgb, var(--muted) 15%, transparent)",
                color: "var(--muted)",
                border: "1px solid color-mix(in srgb, var(--muted) 30%, transparent)",
              }}
            >
              {doneCount} done
            </span>
          </div>
        )}
      </div>

      {/* Two-column layout */}
      <div className="inbox-grid">
        {/* Left Column - Task List */}
        <div style={{ minWidth: 0, paddingRight: "0.5rem", paddingBottom: "2rem" }}>
          {/* Search and Filter */}
          {items.length > 0 && (
            <SearchBar
              value={filters}
              onChange={setFilters}
              projects={projects}
              tags={tags}
              context="inbox"
              resultCount={sortedItems.length}
            />
          )}

          {/* Sort Controls */}
          {items.length > 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                marginBottom: "1rem",
                flexWrap: "wrap",
              }}
            >
              <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>Sort:</span>
              <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      if (sort.field === opt.value) {
                        setSort({ ...sort, direction: sort.direction === "asc" ? "desc" : "asc" });
                      } else {
                        setSort({ field: opt.value, direction: "desc" });
                      }
                    }}
                    style={{
                      padding: "0.3rem 0.6rem",
                      backgroundColor: sort.field === opt.value ? "var(--accent)" : "var(--panel-2)",
                      color: sort.field === opt.value ? "white" : "var(--muted)",
                      border: sort.field === opt.value ? "1px solid var(--accent)" : "1px solid var(--border)",
                      borderRadius: "6px",
                      fontSize: "0.78rem",
                      cursor: "pointer",
                      fontWeight: sort.field === opt.value ? "500" : "400",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {opt.label}
                    {sort.field === opt.value && (
                      <span style={{ marginLeft: "0.25rem" }}>
                        {sort.direction === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Task List */}
          {items.length === 0 ? (
            <div
              style={{
                padding: "3rem 2rem",
                textAlign: "center",
                backgroundColor: "var(--panel)",
                borderRadius: "12px",
                border: "1px solid var(--border)",
                color: "var(--muted)",
              }}
            >
              <div style={{ fontSize: "2rem", marginBottom: "0.75rem", opacity: 0.5 }}>
                { /* inbox icon */ }
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block" }}>
                  <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
                  <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
                </svg>
              </div>
              <p style={{ fontSize: "1rem", marginBottom: "0.5rem", color: "var(--text)" }}>
                Your inbox is empty
              </p>
              <p style={{ fontSize: "0.85rem" }}>
                Add your first tasks using the panel on the right
              </p>
            </div>
          ) : sortedItems.length === 0 ? (
            <div
              style={{
                padding: "2rem",
                textAlign: "center",
                backgroundColor: "var(--panel)",
                borderRadius: "12px",
                border: "1px solid var(--border)",
                color: "var(--muted)",
              }}
            >
              No tasks match your filters. Try adjusting or clearing filters.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {sortedItems.map((item) => (
                <div key={item.id}>
                  <div
                    style={{
                      fontSize: "0.78rem",
                      color: "var(--muted)",
                      marginBottom: "0.35rem",
                      display: "flex",
                      gap: "0.75rem",
                      alignItems: "center",
                    }}
                  >
                    <span>
                      {new Date(item.created_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <span
                      className="badge"
                      style={{
                        padding: "0.1rem 0.4rem",
                        fontSize: "0.65rem",
                        fontWeight: "500",
                        ...(item.status === "active"
                          ? {
                              backgroundColor: "color-mix(in srgb, var(--accent-2) 15%, transparent)",
                              color: "var(--accent-2)",
                              border: "1px solid color-mix(in srgb, var(--accent-2) 30%, transparent)",
                            }
                          : item.status === "follow-up"
                          ? {
                              backgroundColor: "color-mix(in srgb, var(--warn) 15%, transparent)",
                              color: "var(--warn)",
                              border: "1px solid color-mix(in srgb, var(--warn) 30%, transparent)",
                            }
                          : {
                              backgroundColor: "color-mix(in srgb, var(--muted) 15%, transparent)",
                              color: "var(--muted)",
                              border: "1px solid color-mix(in srgb, var(--muted) 30%, transparent)",
                            }),
                      }}
                    >
                      {item.status === "follow-up" ? "FOLLOW-UP" : item.status.toUpperCase()}
                    </span>
                  </div>
                  <TaskCard
                    id={item.id}
                    result={item.result}
                    status={item.status}
                    originalPrompt={item.request?.raw_text}
                    emailContext={item.email_context}
                    onToggleDone={() => handleToggleDone(item.id)}
                    onMove={() => handleMove(item.id)}
                    onDelete={() => handleDelete(item.id)}
                    onChange={() => setItems(getInboxItems())}
                    selectable={true}
                    isSelected={selectedIds.has(item.id)}
                    onToggleSelect={() => toggleSelect(item.id)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column - Add Tasks & Email (independent scroll) */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", paddingLeft: "0.5rem", paddingBottom: "2rem" }}>
          <InlineCapture
            defaultBucket="active"
            onTasksAdded={() => setItems(getInboxItems())}
          />

          <div>
            <h3 style={{ fontSize: "1rem", fontWeight: "600", marginBottom: "0.75rem", color: "var(--text)" }}>
              Import from Email
            </h3>
            <EmailDropZone
              onEmailsParsed={handleEmailsParsed}
              isProcessing={isEmailProcessing}
            />
          </div>

          <EmailActionItems
            results={emailResults}
            onAddToInbox={handleEmailAddToInbox}
            onDismiss={handleEmailDismiss}
          />
        </div>
      </div>

      {/* Bulk selection bar */}
      <BulkBar
        count={selectedIds.size}
        onDone={handleBulkDone}
        onMove={handleBulkMove}
        onDue={handleBulkDue}
        onCancel={handleBulkCancel}
      />

      {/* Email toast */}
      {emailToast && (
        <div
          style={{
            position: "fixed",
            bottom: "2rem",
            right: "2rem",
            padding: "1rem 1.5rem",
            backgroundColor: "var(--panel)",
            color: "var(--text)",
            borderRadius: "0.75rem",
            border: "1px solid var(--border)",
            boxShadow: "0 4px 8px rgba(0,0,0,0.3)",
            zIndex: 1000,
          }}
        >
          {emailToast}
        </div>
      )}
    </div>
  );
}
