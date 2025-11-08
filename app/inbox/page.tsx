"use client";

import { useState, useEffect, useMemo } from "react";
import TaskForm from "@/app/components/TaskForm";
import TaskCard from "@/app/components/TaskCard";
import SearchBar from "@/app/components/SearchBar";
import NotifyBanner from "@/app/components/NotifyBanner";
import InstallCTA from "@/app/components/InstallCTA";
import BulkBar from "@/app/components/BulkBar";
import {
  getInboxItems,
  saveInboxItem,
  updateInboxItemStatus,
  deleteInboxItem,
  bulkMarkDone,
  bulkMoveToBucket,
  bulkSetDue,
  type InboxItem,
} from "@/src/lib/clientStore";
import { getWorkSettings } from "@/src/lib/settings";
import { inc } from "@/src/db/metrics";
import type { CleanTaskRequest, CleanTaskResponse } from "@/src/types";
import { applyFilters, DEFAULT_FILTERS, type Filters } from "@/src/lib/filter";
import { getDistinctProjects, getDistinctTags } from "@/src/db/queries";
import { getQuickDateActions } from "@/src/lib/quickdates";

export default function InboxPage() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [mounted, setMounted] = useState(false);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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

  // Handle form submission
  const handleSubmit = async (request: CleanTaskRequest): Promise<CleanTaskResponse> => {
    const response = await fetch("/api/ai/clean_task", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...request, settings }),
    });

    if (!response.ok) {
      const errorData = await response.json();

      if (response.status === 422) {
        // Validation error
        const details = errorData.details || errorData.error;
        throw new Error(`Validation failed: ${JSON.stringify(details)}`);
      }

      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    return await response.json();
  };

  // Handle successful cleaning
  const handleSuccess = async (result: CleanTaskResponse, request: CleanTaskRequest) => {
    const newItem: InboxItem = {
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      request,
      result,
      status: "inbox",
    };

    saveInboxItem(newItem);
    await inc('tasksCreated');
    setItems(getInboxItems());
  };

  // Handle move to active
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
          Paste a messy task description below and let AI clean it up.
        </p>

        {/* Task Form */}
        <div
          style={{
            marginBottom: "3rem",
            padding: "1rem",
            backgroundColor: "var(--panel)",
            border: "1px solid var(--border)",
            borderRadius: "12px",
          }}
        >
          <TaskForm onSubmit={handleSubmit} onSuccess={handleSuccess} />
        </div>

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
              No tasks yet. Use the form above to clean your first task.
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
                    showActions={true}
                    onMoveToActive={() => handleMoveToActive(item.id)}
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
    </div>
  );
}
