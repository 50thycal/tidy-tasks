"use client";

import { useState, useEffect, useMemo } from "react";
import TaskCard from "@/app/components/TaskCard";
import SearchBar from "@/app/components/SearchBar";
import NotifyBanner from "@/app/components/NotifyBanner";
import InstallCTA from "@/app/components/InstallCTA";
import BulkBar from "@/app/components/BulkBar";
import { CapturePanel } from "@/app/components/CapturePanel";
import {
  getInboxItems,
  updateInboxItemStatus,
  deleteInboxItem,
  bulkMarkDone,
  bulkMoveToBucket,
  bulkSetDue,
  type InboxItem,
} from "@/src/lib/clientStore";
import { getWorkSettings } from "@/src/lib/settings";
import { applyFilters, DEFAULT_FILTERS, type Filters } from "@/src/lib/filter";
import { getDistinctProjects, getDistinctTags } from "@/src/db/queries";
import { getQuickDateActions } from "@/src/lib/quickdates";

export default function InboxPage() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [mounted, setMounted] = useState(false);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [capturePanelOpen, setCapturePanelOpen] = useState(false);

  // Load items from localStorage on mount
  useEffect(() => {
    setMounted(true);
    setItems(getInboxItems());
  }, []);

  // Get work settings
  const settings = getWorkSettings();

  // Compute distinct values for filters
  const projects = useMemo(() => getDistinctProjects(), [items]);
  const tags = useMemo(() => getDistinctTags(), [items]);

  // Apply filters to items
  const filteredItems = useMemo(() => {
    return applyFilters(items, filters, settings);
  }, [items, filters, settings]);

  // Handle toggle done
  const handleToggleDone = (id: string) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const newStatus = item.status === "done" ? "active" : "done";
    updateInboxItemStatus(id, newStatus);
    setItems(getInboxItems());
  };

  // Handle move (opens move dialog or moves to default location)
  const handleMove = (id: string) => {
    // For now, just move to active as default behavior
    updateInboxItemStatus(id, "active");
    setItems(getInboxItems());
  };

  // Handle move to active (legacy)
  const handleMoveToActive = (id: string) => {
    updateInboxItemStatus(id, "active");
    setItems(getInboxItems());
  };

  // Handle delete
  const handleDelete = (id: string) => {
    deleteInboxItem(id);
    setItems(getInboxItems());
  };

  // Bulk selection handlers
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

  // Don't render until mounted (to avoid hydration mismatch)
  if (!mounted) {
    return (
      <div style={{ padding: "2rem" }}>
        <div style={{ maxWidth: "800px", margin: "0 auto" }}>
          <h1>Inbox</h1>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "2rem", minHeight: "100vh" }}>
      <div style={{ maxWidth: "800px", margin: "0 auto" }}>
        {/* Notification Banner */}
        <NotifyBanner />

        {/* Install CTA */}
        <InstallCTA />

        <h1 style={{ marginBottom: "1rem" }}>Inbox</h1>
        <p style={{ color: "var(--muted)", marginBottom: "2rem" }}>
          Your task inbox. Use the side panel to add and clean tasks with AI.
        </p>

        {/* Saved Items List */}
        <div>
          <h2 style={{ fontSize: "1.25rem", marginBottom: "1rem" }}>
            Saved Tasks {items.length > 0 && `(${items.length})`}
          </h2>

          {/* Search and Filter */}
          {items.length > 0 && (
            <SearchBar
              value={filters}
              onChange={setFilters}
              projects={projects}
              tags={tags}
              context="inbox"
              resultCount={filteredItems.length}
            />
          )}

          {items.length === 0 ? (
            <div
              style={{
                padding: "2rem",
                textAlign: "center",
                backgroundColor: "var(--panel-2)",
                borderRadius: "8px",
                color: "var(--muted)",
              }}
            >
              No tasks yet. Use the side panel to add your first task.
            </div>
          ) : filteredItems.length === 0 ? (
            <div
              style={{
                padding: "2rem",
                textAlign: "center",
                backgroundColor: "var(--panel-2)",
                borderRadius: "8px",
                color: "var(--muted)",
              }}
            >
              No tasks match your filters. Try adjusting or clearing filters.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {filteredItems.map((item) => (
                <div key={item.id}>
                  <div
                    style={{
                      fontSize: "0.85rem",
                      color: "var(--muted)",
                      marginBottom: "0.5rem",
                      display: "flex",
                      gap: "1rem",
                      alignItems: "center",
                    }}
                  >
                    <span>
                      Created: {new Date(item.created_at).toLocaleString()}
                    </span>
                    <span
                      style={{
                        padding: "0.25rem 0.5rem",
                        backgroundColor: item.status === "active" ? "var(--accent-2)" : "var(--warn)",
                        color: "white",
                        borderRadius: "4px",
                        fontSize: "0.75rem",
                        fontWeight: "500",
                      }}
                    >
                      {item.status.toUpperCase()}
                    </span>
                  </div>
                  <TaskCard
                    id={item.id}
                    result={item.result}
                    status={item.status}
                    originalPrompt={item.request?.raw_text}
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
      </div>

      {/* Bulk selection bar */}
      <BulkBar
        count={selectedIds.size}
        onDone={handleBulkDone}
        onMove={handleBulkMove}
        onDue={handleBulkDue}
        onCancel={handleBulkCancel}
      />

      {/* Capture Panel */}
      <CapturePanel
        isOpen={capturePanelOpen}
        onToggle={() => setCapturePanelOpen(!capturePanelOpen)}
        defaultBucket="inbox"
        onTasksAdded={() => setItems(getInboxItems())}
      />
    </div>
  );
}
