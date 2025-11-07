"use client";

import { useState, useEffect } from "react";
import type { PrioritizeRequest, PrioritizeResponse, PrioritizedItem, EnergyLevel } from "@/src/types";
import { getInboxItems, markItemDone, moveItemToInbox } from "@/src/lib/clientStore";
import { getWorkSettings } from "@/src/lib/settings";
import CapacityBar from "@/app/components/CapacityBar";
import FocusBucket from "@/app/components/FocusBucket";

export default function FocusPage() {
  const [mounted, setMounted] = useState(false);
  const [date, setDate] = useState("");
  const [energy, setEnergy] = useState<EnergyLevel>("med");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prioritizedItems, setPrioritizedItems] = useState<PrioritizedItem[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  // Initialize date to today
  useEffect(() => {
    setMounted(true);
    const today = new Date().toISOString().split("T")[0];
    setDate(today);
  }, []);

  // Load and prioritize on mount
  useEffect(() => {
    if (mounted && date) {
      handlePrioritize();
    }
  }, [mounted, refreshKey]);

  const handlePrioritize = async () => {
    setLoading(true);
    setError(null);

    try {
      const items = getInboxItems();
      const activeItems = items.filter((item) => item.status === "active");

      if (activeItems.length === 0) {
        setPrioritizedItems([]);
        setLoading(false);
        return;
      }

      // Get current settings
      const settings = getWorkSettings();

      // Build request payload (settings will be extracted server-side)
      const request: any = {
        date,
        timezone: settings.timezone,
        energy,
        max_focus_minutes: 240,
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
        settings, // Pass settings to server for context
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

      const data: PrioritizeResponse = await response.json();
      setPrioritizedItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to prioritize tasks");
      console.error("Error prioritizing tasks:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkDone = (id: string) => {
    markItemDone(id);
    setRefreshKey((prev) => prev + 1);
  };

  const handleMoveToInbox = (id: string) => {
    moveItemToInbox(id);
    setRefreshKey((prev) => prev + 1);
  };

  // Calculate capacity
  const items = getInboxItems();
  const activeItems = items.filter((item) => item.status === "active");

  const nowItems = prioritizedItems.filter((item) => item.bucket === "Now");
  const nextItems = prioritizedItems.filter((item) => item.bucket === "Next");
  const laterItems = prioritizedItems.filter((item) => item.bucket === "Later");
  const backlogItems = prioritizedItems.filter((item) => item.bucket === "Backlog");

  const usedMinutes = nowItems.reduce((sum, item) => {
    const inboxItem = items.find((i) => i.id === item.id);
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
    <div style={{ padding: "2rem", minHeight: "100vh" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <h1 style={{ marginBottom: "1rem" }}>Focus Queue</h1>
        <p style={{ color: "var(--muted)", marginBottom: "2rem" }}>
          AI-prioritized tasks for {new Date(date).toLocaleDateString()}
        </p>

        {/* Controls */}
        <div
          style={{
            backgroundColor: "var(--panel)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            padding: "1.5rem",
            marginBottom: "2rem",
            display: "flex",
            gap: "1rem",
            alignItems: "flex-end",
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: "1", minWidth: "150px" }}>
            <label
              htmlFor="date"
              style={{
                display: "block",
                fontWeight: "500",
                marginBottom: "0.5rem",
                color: "var(--text)",
              }}
            >
              Date
            </label>
            <input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="input"
            />
          </div>

          <div style={{ flex: "1", minWidth: "150px" }}>
            <label
              htmlFor="energy"
              style={{
                display: "block",
                fontWeight: "500",
                marginBottom: "0.5rem",
                color: "var(--text)",
              }}
            >
              Energy Level
            </label>
            <select
              id="energy"
              value={energy}
              onChange={(e) => setEnergy(e.target.value as EnergyLevel)}
              className="input"
            >
              <option value="low">Low</option>
              <option value="med">Medium</option>
              <option value="high">High</option>
            </select>
          </div>

          <button
            onClick={handlePrioritize}
            disabled={loading}
            className="btn btn-primary"
            style={{
              padding: "0.5rem 1.5rem",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "Calculating..." : "Recalculate"}
          </button>
        </div>

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

        {/* Capacity bar */}
        {prioritizedItems.length > 0 && (
          <CapacityBar usedMinutes={usedMinutes} maxMinutes={240} />
        )}

        {/* Buckets */}
        {prioritizedItems.length > 0 && (
          <>
            <FocusBucket
              bucket="Now"
              items={nowItems}
              inboxItems={items}
              onMarkDone={handleMarkDone}
              onMoveToInbox={handleMoveToInbox}
            />
            <FocusBucket
              bucket="Next"
              items={nextItems}
              inboxItems={items}
              onMarkDone={handleMarkDone}
              onMoveToInbox={handleMoveToInbox}
            />
            <FocusBucket
              bucket="Later"
              items={laterItems}
              inboxItems={items}
              onMarkDone={handleMarkDone}
              onMoveToInbox={handleMoveToInbox}
            />
            <FocusBucket
              bucket="Backlog"
              items={backlogItems}
              inboxItems={items}
              onMarkDone={handleMarkDone}
              onMoveToInbox={handleMoveToInbox}
            />
          </>
        )}

        {/* Loading state for initial load */}
        {loading && prioritizedItems.length === 0 && (
          <div style={{ textAlign: "center", padding: "3rem", color: "var(--muted)" }}>
            <p>Calculating priorities...</p>
          </div>
        )}
      </div>
    </div>
  );
}
