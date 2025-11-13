"use client";

import { useState, useEffect, useMemo } from "react";
import { DndContext, DragEndEvent, closestCenter } from "@dnd-kit/core";
import type { PrioritizeRequest, PrioritizeResponse, PrioritizedItem, EnergyLevel } from "@/src/types";
import { getInboxItems, markItemDone, moveItemToInbox } from "@/src/lib/clientStore";
import { getWorkSettings } from "@/src/lib/settings";
import { getLayout, upsertLayout } from "@/src/db/focus";
import { mergeOrder, normalizeBucket } from "@/src/lib/focusMerge";
import CapacityBar from "@/app/components/CapacityBar";
import FocusBucket from "@/app/components/FocusBucket";
import FocusControls from "@/app/components/FocusControls";
import SearchBar from "@/app/components/SearchBar";
import { applyFilters, DEFAULT_FILTERS_FOCUS, type Filters } from "@/src/lib/filter";
import { getDistinctProjects, getDistinctTags } from "@/src/db/queries";
import { Skeleton } from "@/src/ui/Skeleton";
import { loadCapacity, saveCapacity, getEffectiveMinutes } from "@/src/lib/focusState";

export default function FocusPage() {
  const [mounted, setMounted] = useState(false);
  const [date, setDate] = useState("");
  const [energy, setEnergy] = useState<EnergyLevel>("med");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prioritizedItems, setPrioritizedItems] = useState<PrioritizedItem[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS_FOCUS);
  const [dirty, setDirty] = useState(false);
  const [capacity, setCapacity] = useState(60);
  const [capacityPlus2h, setCapacityPlus2h] = useState(false);

  // Local ordering overrides
  const [bucketIds, setBucketIds] = useState<{
    now: string[];
    next: string[];
    later: string[];
    backlog: string[];
  }>({
    now: [],
    next: [],
    later: [],
    backlog: [],
  });

  // Initialize date and load capacity on mount
  useEffect(() => {
    setMounted(true);
    const today = new Date().toISOString().split("T")[0];
    setDate(today);

    // Load saved capacity
    const savedCapacity = loadCapacity();
    setCapacity(savedCapacity.minutes);
    setCapacityPlus2h(savedCapacity.plus2h);
  }, []);

  // Load saved layout on mount
  useEffect(() => {
    if (!mounted || !date) return;

    const loadSavedLayout = async () => {
      const savedLayout = await getLayout(date);
      if (!savedLayout) return;

      // Filter to only include tasks that still exist
      const items = getInboxItems();
      const activeItems = items.filter((i) => i.status === "active");
      const activeIds = new Set(activeItems.map((i) => i.id));

      const filteredNow = savedLayout.lists.now.filter(id => activeIds.has(id));
      const filteredNext = savedLayout.lists.next.filter(id => activeIds.has(id));
      const filteredLater = savedLayout.lists.later.filter(id => activeIds.has(id));
      const filteredBacklog = savedLayout.lists.backlog.filter(id => activeIds.has(id));

      // If everything is empty, don't force-render empty buckets
      if (
        filteredNow.length === 0 &&
        filteredNext.length === 0 &&
        filteredLater.length === 0 &&
        filteredBacklog.length === 0
      ) {
        return;
      }

      // Set bucket IDs from saved layout
      setBucketIds({
        now: filteredNow,
        next: filteredNext,
        later: filteredLater,
        backlog: filteredBacklog,
      });

      // Build a minimal PrioritizedItem array so FocusBucket can render
      // without requiring an AI call on load
      const synthetic: PrioritizedItem[] = [
        ...filteredNow.map((id) => ({
          id,
          bucket: "Now" as const,
          priority_score: 0,
          rationale: "", // empty rationale = no banner
        })),
        ...filteredNext.map((id) => ({
          id,
          bucket: "Next" as const,
          priority_score: 0,
          rationale: "",
        })),
        ...filteredLater.map((id) => ({
          id,
          bucket: "Later" as const,
          priority_score: 0,
          rationale: "",
        })),
        ...filteredBacklog.map((id) => ({
          id,
          bucket: "Backlog" as const,
          priority_score: 0,
          rationale: "",
        })),
      ];

      setPrioritizedItems(synthetic);
      // This is the last known clean layout, so not dirty
      setDirty(false);
    };

    loadSavedLayout();
  }, [mounted, date]);

  const handlePrioritize = async () => {
    setLoading(true);
    setError(null);

    try {
      const items = getInboxItems();
      const activeItems = items.filter((item) => item.status === "active");

      if (activeItems.length === 0) {
        setPrioritizedItems([]);
        setBucketIds({ now: [], next: [], later: [], backlog: [] });
        setLoading(false);
        setDirty(false);
        return;
      }

      // Get effective capacity
      const effectiveCapacity = getEffectiveMinutes({ minutes: capacity, plus2h: capacityPlus2h });

      // Build request payload
      const request: any = {
        date,
        timezone: settings.timezone,
        energy,
        max_focus_minutes: effectiveCapacity,
        tasks: activeItems.map((item) => ({
          id: item.id,
          title: item.result.title,
          status: item.status,
          importance: item.result.importance,
          effort_min: item.result.effort_min,
          energy: item.result.energy,
          due_at: item.result.due_at,
          scheduled_for: item.result.scheduled_for || null,
          project: item.result.project,
          tags: item.result.tags,
        })),
        settings,
      };

      // Call API
      const response = await fetch("/api/ai/prioritize_tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const aiData: PrioritizeResponse = await response.json();
      setPrioritizedItems(aiData);

      // Group AI results by bucket
      const aiNow = aiData.filter((item) => item.bucket === "Now").map((i) => i.id);
      const aiNext = aiData.filter((item) => item.bucket === "Next").map((i) => i.id);
      const aiLater = aiData.filter((item) => item.bucket === "Later").map((i) => i.id);
      const aiBacklog = aiData.filter((item) => item.bucket === "Backlog").map((i) => i.id);

      // Load saved layout for this date
      const savedLayout = await getLayout(date);

      // Merge saved order with AI order for each bucket
      const mergedNow = savedLayout?.lists.now ? mergeOrder(savedLayout.lists.now, aiNow) : aiNow;
      const mergedNext = savedLayout?.lists.next ? mergeOrder(savedLayout.lists.next, aiNext) : aiNext;
      const mergedLater = savedLayout?.lists.later ? mergeOrder(savedLayout.lists.later, aiLater) : aiLater;
      const mergedBacklog = savedLayout?.lists.backlog
        ? mergeOrder(savedLayout.lists.backlog, aiBacklog)
        : aiBacklog;

      setBucketIds({
        now: mergedNow,
        next: mergedNext,
        later: mergedLater,
        backlog: mergedBacklog,
      });

      // Persist the layout to localStorage
      await upsertLayout(date, (lists) => {
        lists.now = mergedNow;
        lists.next = mergedNext;
        lists.later = mergedLater;
        lists.backlog = mergedBacklog;
      });

      // Clear dirty flag on successful calculation
      setDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to prioritize tasks");
      console.error("Error prioritizing tasks:", err);
    } finally {
      setLoading(false);
    }
  };

  // Save capacity to localStorage when it changes
  useEffect(() => {
    if (mounted) {
      saveCapacity(capacity, capacityPlus2h);
    }
  }, [capacity, capacityPlus2h, mounted]);

  const handleMarkDone = async (id: string) => {
    await markItemDone(id);
    setRefreshKey((prev) => prev + 1);
    setDirty(true);
  };

  const handleMoveToInbox = (id: string) => {
    moveItemToInbox(id);
    setRefreshKey((prev) => prev + 1);
    setDirty(true);
  };

  // Handle drag end within a bucket
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    // Find which bucket contains the active item
    let sourceBucket: "now" | "next" | "later" | "backlog" | null = null;
    for (const [bucket, ids] of Object.entries(bucketIds)) {
      if (ids.includes(active.id as string)) {
        sourceBucket = bucket as "now" | "next" | "later" | "backlog";
        break;
      }
    }

    if (!sourceBucket) return;

    // Reorder within the source bucket
    const sourceIds = [...bucketIds[sourceBucket]];
    const oldIndex = sourceIds.indexOf(active.id as string);
    const newIndex = sourceIds.indexOf(over.id as string);

    if (oldIndex === -1 || newIndex === -1) return;

    // Remove from old position and insert at new position
    sourceIds.splice(oldIndex, 1);
    sourceIds.splice(newIndex, 0, active.id as string);

    // Update state
    const newBucketIds = {
      ...bucketIds,
      [sourceBucket]: sourceIds,
    };
    setBucketIds(newBucketIds);

    // Persist to localStorage
    await upsertLayout(date, (lists) => {
      lists[sourceBucket!] = sourceIds;
    });
  };

  // Handle "Send to..." bucket move
  const handleSendTo = async (taskId: string, targetBucket: "now" | "next" | "later" | "backlog") => {
    // Find current bucket
    let sourceBucket: "now" | "next" | "later" | "backlog" | null = null;
    for (const [bucket, ids] of Object.entries(bucketIds)) {
      if (ids.includes(taskId)) {
        sourceBucket = bucket as "now" | "next" | "later" | "backlog";
        break;
      }
    }

    if (!sourceBucket || sourceBucket === targetBucket) return;

    // Remove from source bucket
    const newSourceIds = bucketIds[sourceBucket].filter((id) => id !== taskId);

    // Add to target bucket (at the end)
    const newTargetIds = [...bucketIds[targetBucket], taskId];

    // Update state
    const newBucketIds = {
      ...bucketIds,
      [sourceBucket]: newSourceIds,
      [targetBucket]: newTargetIds,
    };
    setBucketIds(newBucketIds);

    // Persist to localStorage
    await upsertLayout(date, (lists) => {
      lists[sourceBucket!] = newSourceIds;
      lists[targetBucket] = newTargetIds;
    });

    // Mark as dirty since bucket assignments changed
    setDirty(true);
  };

  // Handle reset to AI order for a specific bucket
  const handleResetBucket = async (bucket: "now" | "next" | "later" | "backlog") => {
    // Get AI order for this bucket
    const bucketName = bucket.charAt(0).toUpperCase() + bucket.slice(1);
    const aiIds = prioritizedItems.filter((item) => item.bucket === bucketName).map((i) => i.id);

    // Update state
    setBucketIds({
      ...bucketIds,
      [bucket]: aiIds,
    });

    // Clear saved order for this bucket (set to empty, will use AI order on next load)
    await upsertLayout(date, (lists) => {
      lists[bucket] = [];
    });
  };

  // Get work settings
  const settings = getWorkSettings();

  // Calculate capacity
  const items = getInboxItems();
  const activeItems = items.filter((item) => item.status === "active");

  // Compute distinct values for filters (from active items only)
  const projects = useMemo(() => {
    const projectsSet = new Set<string>();
    for (const item of activeItems) {
      if (item.result.project) {
        projectsSet.add(item.result.project);
      }
    }
    return Array.from(projectsSet).sort((a, b) => a.localeCompare(b));
  }, [activeItems]);

  const tags = useMemo(() => {
    const tagsSet = new Set<string>();
    for (const item of activeItems) {
      if (item.result.tags && item.result.tags.length > 0) {
        for (const tag of item.result.tags) {
          tagsSet.add(tag);
        }
      }
    }
    return Array.from(tagsSet).sort((a, b) => a.localeCompare(b));
  }, [activeItems]);

  // Apply filters to active items to get filtered IDs
  const filteredActiveItems = useMemo(() => {
    return applyFilters(activeItems, filters, settings);
  }, [activeItems, filters, settings]);

  const filteredIds = useMemo(() => {
    return new Set(filteredActiveItems.map((item) => item.id));
  }, [filteredActiveItems]);

  // Filter bucket IDs to only include filtered items
  const filteredBucketIds = useMemo(() => {
    return {
      now: bucketIds.now.filter((id) => filteredIds.has(id)),
      next: bucketIds.next.filter((id) => filteredIds.has(id)),
      later: bucketIds.later.filter((id) => filteredIds.has(id)),
      backlog: bucketIds.backlog.filter((id) => filteredIds.has(id)),
    };
  }, [bucketIds, filteredIds]);

  const usedMinutes = filteredBucketIds.now.reduce((sum, taskId) => {
    const inboxItem = items.find((i) => i.id === taskId);
    return sum + (inboxItem?.result.effort_min || 0);
  }, 0);

  if (!mounted) {
    return (
      <div style={{ padding: "2rem" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <h1>Focus Queue</h1>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  // Empty state
  if (activeItems.length === 0 && !loading) {
    return (
      <div style={{ padding: "2rem", minHeight: "100vh" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <h1 style={{ marginBottom: "1rem" }}>Focus Queue</h1>
          <div
            style={{
              backgroundColor: "var(--panel)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              padding: "3rem",
              textAlign: "center",
              color: "var(--muted)",
            }}
          >
            <h3 style={{ marginBottom: "1rem" }}>No active tasks</h3>
            <p style={{ marginBottom: "1.5rem" }}>
              Move tasks from your Inbox to start planning your Focus Queue.
            </p>
            <a
              href="/inbox"
              style={{
                display: "inline-block",
                padding: "0.75rem 1.5rem",
                backgroundColor: "var(--accent)",
                color: "white",
                textDecoration: "none",
                borderRadius: "4px",
                fontSize: "1rem",
              }}
            >
              Go to Inbox
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div style={{ padding: "2rem", minHeight: "100vh" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <h1 style={{ marginBottom: "1rem" }}>Focus Queue</h1>
          <p style={{ color: "var(--muted)", marginBottom: "2rem" }}>
            AI-prioritized tasks for {new Date(date).toLocaleDateString()}. Drag to reorder within buckets.
          </p>

          {/* Focus Controls */}
          <FocusControls
            capacity={capacity}
            setCapacity={setCapacity}
            capacityPlus2h={capacityPlus2h}
            setCapacityPlus2h={setCapacityPlus2h}
            dirty={dirty}
            calculating={loading}
            onCalculate={handlePrioritize}
          />

          {/* Error message */}
          {error && (
            <div
              style={{
                padding: "1rem",
                backgroundColor: "color-mix(in srgb, var(--danger) 15%, transparent)",
                color: "var(--danger)",
                borderRadius: "4px",
                marginBottom: "1.5rem",
                border: "1px solid var(--border)",
              }}
            >
              <strong>Error:</strong> {error}
            </div>
          )}

          {/* Search and Filter */}
          {activeItems.length > 0 && (
            <SearchBar
              value={filters}
              onChange={setFilters}
              projects={projects}
              tags={tags}
              context="focus"
              resultCount={filteredActiveItems.length}
            />
          )}

          {/* Capacity bar */}
          {prioritizedItems.length > 0 && (
            <CapacityBar
              usedMinutes={usedMinutes}
              maxMinutes={getEffectiveMinutes({ minutes: capacity, plus2h: capacityPlus2h })}
            />
          )}

          {/* Buckets */}
          {prioritizedItems.length > 0 && (
            <>
              <FocusBucket
                bucket="Now"
                itemIds={filteredBucketIds.now}
                prioritizedItems={prioritizedItems}
                inboxItems={items}
                onMarkDone={handleMarkDone}
                onMoveToInbox={handleMoveToInbox}
                onRefresh={() => setRefreshKey((prev) => prev + 1)}
                onSendTo={handleSendTo}
                onResetToAI={() => handleResetBucket("now")}
              />
              <FocusBucket
                bucket="Next"
                itemIds={filteredBucketIds.next}
                prioritizedItems={prioritizedItems}
                inboxItems={items}
                onMarkDone={handleMarkDone}
                onMoveToInbox={handleMoveToInbox}
                onRefresh={() => setRefreshKey((prev) => prev + 1)}
                onSendTo={handleSendTo}
                onResetToAI={() => handleResetBucket("next")}
              />
              <FocusBucket
                bucket="Later"
                itemIds={filteredBucketIds.later}
                prioritizedItems={prioritizedItems}
                inboxItems={items}
                onMarkDone={handleMarkDone}
                onMoveToInbox={handleMoveToInbox}
                onRefresh={() => setRefreshKey((prev) => prev + 1)}
                onSendTo={handleSendTo}
                onResetToAI={() => handleResetBucket("later")}
              />
              <FocusBucket
                bucket="Backlog"
                itemIds={filteredBucketIds.backlog}
                prioritizedItems={prioritizedItems}
                inboxItems={items}
                onMarkDone={handleMarkDone}
                onMoveToInbox={handleMoveToInbox}
                onRefresh={() => setRefreshKey((prev) => prev + 1)}
                onSendTo={handleSendTo}
                onResetToAI={() => handleResetBucket("backlog")}
              />
            </>
          )}

          {/* Loading state for initial load */}
          {loading && prioritizedItems.length === 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i}>
                  <Skeleton h={20} w="120px" />
                  <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    {Array.from({ length: 2 }).map((_, j) => (
                      <div
                        key={j}
                        style={{
                          border: "1px solid var(--border)",
                          borderRadius: "8px",
                          padding: "1rem",
                          backgroundColor: "var(--panel-2)",
                        }}
                      >
                        <Skeleton h={16} w="70%" />
                        <div style={{ marginTop: "0.75rem" }}>
                          <Skeleton h={12} w="100%" />
                        </div>
                        <div style={{ marginTop: "0.5rem" }}>
                          <Skeleton h={12} w="85%" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DndContext>
  );
}
