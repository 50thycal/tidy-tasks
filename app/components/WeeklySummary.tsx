"use client";

import { useState, useEffect } from "react";
import type { WeeklySummaryResponse, WeeklySummaryTask } from "@/src/types";
import { SkeletonLines } from "@/src/ui/Skeleton";

interface WeeklySummaryProps {
  tasks: WeeklySummaryTask[];
  initialWeekStart?: string;
  initialWeekEnd?: string;
}

export default function WeeklySummary({
  tasks,
  initialWeekStart,
  initialWeekEnd,
}: WeeklySummaryProps) {
  const [weekStart, setWeekStart] = useState(initialWeekStart || getCurrentMonday());
  const [weekEnd, setWeekEnd] = useState(initialWeekEnd || getCurrentSunday());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<WeeklySummaryResponse | null>(null);

  // Load cached summary on mount
  useEffect(() => {
    const cached = getCachedSummary(weekStart, weekEnd);
    if (cached) {
      setSummary(cached);
    }
  }, [weekStart, weekEnd]);

  const handleGenerateSummary = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/ai/weekly_summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          week_start: weekStart,
          week_end: weekEnd,
          tasks,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data: WeeklySummaryResponse = await response.json();
      setSummary(data);

      // Cache the result
      cacheSummary(weekStart, weekEnd, data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate summary");
      console.error("Error generating summary:", err);
    } finally {
      setLoading(false);
    }
  };

  const handlePrevWeek = () => {
    const start = new Date(weekStart);
    start.setDate(start.getDate() - 7);
    const end = new Date(weekEnd);
    end.setDate(end.getDate() - 7);
    setWeekStart(formatDate(start));
    setWeekEnd(formatDate(end));
    setSummary(null); // Clear current summary
  };

  const handleNextWeek = () => {
    const start = new Date(weekStart);
    start.setDate(start.getDate() + 7);
    const end = new Date(weekEnd);
    end.setDate(end.getDate() + 7);
    setWeekStart(formatDate(start));
    setWeekEnd(formatDate(end));
    setSummary(null); // Clear current summary
  };

  const handleRetry = () => {
    handleGenerateSummary();
  };

  return (
    <div
      style={{
        backgroundColor: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: "8px",
        padding: "1.5rem",
        marginBottom: "2rem",
      }}
    >
      <h2 style={{ marginBottom: "1rem", color: "var(--text)" }}>Weekly Summary</h2>

      {/* Week picker */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "1rem",
          marginBottom: "1rem",
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={handlePrevWeek}
          disabled={loading}
          style={{
            padding: "0.5rem 0.75rem",
            backgroundColor: "var(--panel-2)",
            color: "var(--text)",
            border: "1px solid var(--border)",
            borderRadius: "4px",
            cursor: loading ? "not-allowed" : "pointer",
            fontSize: "0.9rem",
          }}
        >
          ← Prev Week
        </button>
        <span style={{ color: "var(--text)", fontSize: "1rem", fontWeight: "500" }}>
          {formatWeekDisplay(weekStart, weekEnd)}
        </span>
        <button
          onClick={handleNextWeek}
          disabled={loading}
          style={{
            padding: "0.5rem 0.75rem",
            backgroundColor: "var(--panel-2)",
            color: "var(--text)",
            border: "1px solid var(--border)",
            borderRadius: "4px",
            cursor: loading ? "not-allowed" : "pointer",
            fontSize: "0.9rem",
          }}
        >
          Next Week →
        </button>
        <button
          onClick={handleGenerateSummary}
          disabled={loading}
          className="btn btn-primary"
          style={{
            padding: "0.5rem 1.5rem",
            marginLeft: "auto",
            opacity: loading ? 0.6 : 1,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Generating..." : "Generate Summary"}
        </button>
      </div>

      {/* Error message */}
      {error && (
        <div
          style={{
            padding: "0.75rem",
            backgroundColor: "color-mix(in srgb, var(--danger) 15%, transparent)",
            color: "var(--danger)",
            borderRadius: "4px",
            marginBottom: "1rem",
            border: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{error}</span>
          <button
            onClick={handleRetry}
            style={{
              padding: "0.25rem 0.75rem",
              backgroundColor: "var(--danger)",
              color: "white",
              border: "none",
              borderRadius: "4px",
              fontSize: "0.85rem",
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div style={{ padding: "1rem" }}>
          <SkeletonLines lines={8} />
        </div>
      )}

      {/* Summary result */}
      {summary && !loading && (
        <div>
          <h3 style={{ marginBottom: "1rem", color: "var(--text)", fontSize: "1.25rem" }}>
            {summary.title}
          </h3>

          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            {/* Wins */}
            <div>
              <h4 style={{ color: "var(--accent-2)", marginBottom: "0.5rem", fontSize: "1rem" }}>
                🎯 Wins
              </h4>
              <div
                style={{
                  whiteSpace: "pre-wrap",
                  color: "var(--text)",
                  fontSize: "0.95rem",
                  lineHeight: "1.6",
                  paddingLeft: "0.5rem",
                }}
              >
                {summary.wins}
              </div>
            </div>

            {/* Stuck */}
            <div>
              <h4 style={{ color: "var(--warn)", marginBottom: "0.5rem", fontSize: "1rem" }}>
                ⚠️ Stuck / Risks
              </h4>
              <div
                style={{
                  whiteSpace: "pre-wrap",
                  color: "var(--text)",
                  fontSize: "0.95rem",
                  lineHeight: "1.6",
                  paddingLeft: "0.5rem",
                }}
              >
                {summary.stuck}
              </div>
            </div>

            {/* Next Focus */}
            <div>
              <h4 style={{ color: "var(--accent)", marginBottom: "0.5rem", fontSize: "1rem" }}>
                🚀 Next Focus
              </h4>
              <div
                style={{
                  whiteSpace: "pre-wrap",
                  color: "var(--text)",
                  fontSize: "0.95rem",
                  lineHeight: "1.6",
                  paddingLeft: "0.5rem",
                }}
              >
                {summary.next_focus}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Empty state when no summary yet */}
      {!summary && !loading && !error && (
        <div
          style={{
            padding: "2rem",
            textAlign: "center",
            color: "var(--muted)",
            fontSize: "0.9rem",
          }}
        >
          Click "Generate Summary" to analyze tasks for this week
        </div>
      )}
    </div>
  );
}

// Helper functions
function getCurrentMonday(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Sunday = 0, Monday = 1
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  return formatDate(monday);
}

function getCurrentSunday(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? 0 : 7 - day;
  const sunday = new Date(now);
  sunday.setDate(now.getDate() + diff);
  return formatDate(sunday);
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

function formatWeekDisplay(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${startDate.toLocaleDateString("en-US", options)} – ${endDate.toLocaleDateString("en-US", options)}`;
}

function getCachedSummary(weekStart: string, weekEnd: string): WeeklySummaryResponse | null {
  try {
    const key = `summary:${weekStart}-${weekEnd}`;
    const cached = localStorage.getItem(key);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (e) {
    console.error("Error reading cached summary:", e);
  }
  return null;
}

function cacheSummary(weekStart: string, weekEnd: string, summary: WeeklySummaryResponse) {
  try {
    const key = `summary:${weekStart}-${weekEnd}`;
    localStorage.setItem(key, JSON.stringify(summary));
  } catch (e) {
    console.error("Error caching summary:", e);
  }
}
