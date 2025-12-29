"use client";

import { useState, useEffect, useCallback } from "react";
import type { Filters } from "@/src/lib/filter";
import type { InboxItemStatus } from "@/src/lib/clientStore";

interface SearchBarProps {
  value: Filters;
  onChange: (filters: Filters) => void;
  projects: string[];
  tags: string[];
  context: "inbox" | "focus";
  resultCount?: number;
}

export default function SearchBar({
  value,
  onChange,
  projects,
  tags,
  context,
  resultCount,
}: SearchBarProps) {
  const [searchInput, setSearchInput] = useState(value.q);
  const [showFilters, setShowFilters] = useState(false);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      onChange({ ...value, q: searchInput });
    }, 200);

    return () => clearTimeout(timer);
  }, [searchInput]);

  // Update local state when external value changes
  useEffect(() => {
    setSearchInput(value.q);
  }, [value.q]);

  const handleClearAll = () => {
    const cleared: Filters = {
      q: "",
      statuses: context === "inbox" ? ["active", "follow-up"] : undefined,
      projects: [],
      tags: [],
      due: "any",
      energy: "any",
      effort: "any",
    };
    setSearchInput("");
    onChange(cleared);
  };

  const toggleStatus = (status: InboxItemStatus) => {
    const current = value.statuses || [];
    const updated = current.includes(status)
      ? current.filter((s) => s !== status)
      : [...current, status];
    onChange({ ...value, statuses: updated.length > 0 ? updated : undefined });
  };

  const toggleProject = (project: string) => {
    const current = value.projects || [];
    const updated = current.includes(project)
      ? current.filter((p) => p !== project)
      : [...current, project];
    onChange({ ...value, projects: updated });
  };

  const toggleTag = (tag: string) => {
    const current = value.tags || [];
    const updated = current.includes(tag)
      ? current.filter((t) => t !== tag)
      : [...current, tag];
    onChange({ ...value, tags: updated });
  };

  const hasActiveFilters =
    (value.statuses && value.statuses.length !== (context === "inbox" ? 2 : 0)) ||
    (value.projects && value.projects.length > 0) ||
    (value.tags && value.tags.length > 0) ||
    value.due !== "any" ||
    value.energy !== "any" ||
    value.effort !== "any" ||
    value.q.length > 0;

  return (
    <div
      style={{
        backgroundColor: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: "8px",
        padding: "1rem",
        marginBottom: "1.5rem",
      }}
    >
      {/* Search input */}
      <div style={{ marginBottom: "1rem" }}>
        <input
          type="search"
          placeholder="Search tasks..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          style={{
            width: "100%",
            padding: "0.75rem",
            backgroundColor: "var(--panel-2)",
            color: "var(--text)",
            border: "1px solid var(--border)",
            borderRadius: "4px",
            fontSize: "1rem",
          }}
        />
      </div>

      {/* Toggle filters button */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <button
          onClick={() => setShowFilters(!showFilters)}
          style={{
            padding: "0.5rem 1rem",
            backgroundColor: showFilters ? "var(--accent)" : "var(--panel-2)",
            color: showFilters ? "white" : "var(--text)",
            border: "1px solid var(--border)",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "0.9rem",
          }}
        >
          {showFilters ? "▼ " : "▶ "} Filters {hasActiveFilters ? `(${getActiveFilterCount(value, context)})` : ""}
        </button>

        {resultCount !== undefined && (
          <span style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
            {resultCount} {resultCount === 1 ? "result" : "results"}
          </span>
        )}

        {hasActiveFilters && (
          <button
            onClick={handleClearAll}
            style={{
              padding: "0.5rem 1rem",
              backgroundColor: "var(--panel-2)",
              color: "var(--danger)",
              border: "1px solid var(--border)",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "0.85rem",
            }}
          >
            Clear All
          </button>
        )}
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* Status filters (Inbox only) */}
          {context === "inbox" && (
            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "500", marginBottom: "0.5rem", color: "var(--muted)" }}>
                Status
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                {(["active", "follow-up", "done"] as InboxItemStatus[]).map((status) => (
                  <button
                    key={status}
                    onClick={() => toggleStatus(status)}
                    style={{
                      padding: "0.375rem 0.75rem",
                      backgroundColor: value.statuses?.includes(status) ? "var(--accent)" : "var(--panel-2)",
                      color: value.statuses?.includes(status) ? "white" : "var(--text)",
                      border: "1px solid var(--border)",
                      borderRadius: "4px",
                      cursor: "pointer",
                      fontSize: "0.85rem",
                    }}
                  >
                    {status === "follow-up" ? "Follow-up" : status.charAt(0).toUpperCase() + status.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Due filter */}
          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "500", marginBottom: "0.5rem", color: "var(--muted)" }}>
              Due Date
            </label>
            <select
              value={value.due}
              onChange={(e) => onChange({ ...value, due: e.target.value as Filters["due"] })}
              style={{
                padding: "0.5rem",
                backgroundColor: "var(--panel-2)",
                color: "var(--text)",
                border: "1px solid var(--border)",
                borderRadius: "4px",
                fontSize: "0.9rem",
                width: "100%",
              }}
            >
              <option value="any">Any</option>
              <option value="overdue">Overdue</option>
              <option value="today">Today</option>
              <option value="thisWeek">This Week</option>
              <option value="nextWeek">Next Week</option>
              <option value="none">No Due Date</option>
            </select>
          </div>

          {/* Energy filter */}
          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "500", marginBottom: "0.5rem", color: "var(--muted)" }}>
              Energy
            </label>
            <select
              value={value.energy}
              onChange={(e) => onChange({ ...value, energy: e.target.value as Filters["energy"] })}
              style={{
                padding: "0.5rem",
                backgroundColor: "var(--panel-2)",
                color: "var(--text)",
                border: "1px solid var(--border)",
                borderRadius: "4px",
                fontSize: "0.9rem",
                width: "100%",
              }}
            >
              <option value="any">Any</option>
              <option value="low">Low</option>
              <option value="med">Medium</option>
              <option value="high">High</option>
            </select>
          </div>

          {/* Effort filter */}
          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "500", marginBottom: "0.5rem", color: "var(--muted)" }}>
              Effort (minutes)
            </label>
            <select
              value={value.effort}
              onChange={(e) =>
                onChange({
                  ...value,
                  effort: e.target.value === "any" ? "any" : Number(e.target.value),
                })
              }
              style={{
                padding: "0.5rem",
                backgroundColor: "var(--panel-2)",
                color: "var(--text)",
                border: "1px solid var(--border)",
                borderRadius: "4px",
                fontSize: "0.9rem",
                width: "100%",
              }}
            >
              <option value="any">Any</option>
              <option value="5">5 min</option>
              <option value="15">15 min</option>
              <option value="30">30 min</option>
              <option value="60">60 min</option>
              <option value="120">120 min</option>
            </select>
          </div>

          {/* Projects filter */}
          {projects.length > 0 && (
            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "500", marginBottom: "0.5rem", color: "var(--muted)" }}>
                Projects
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", maxHeight: "120px", overflowY: "auto" }}>
                {projects.map((project) => (
                  <button
                    key={project}
                    onClick={() => toggleProject(project)}
                    style={{
                      padding: "0.375rem 0.75rem",
                      backgroundColor: value.projects?.includes(project) ? "var(--accent)" : "var(--panel-2)",
                      color: value.projects?.includes(project) ? "white" : "var(--text)",
                      border: "1px solid var(--border)",
                      borderRadius: "4px",
                      cursor: "pointer",
                      fontSize: "0.85rem",
                    }}
                  >
                    {project}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tags filter */}
          {tags.length > 0 && (
            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "500", marginBottom: "0.5rem", color: "var(--muted)" }}>
                Tags
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", maxHeight: "120px", overflowY: "auto" }}>
                {tags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    style={{
                      padding: "0.375rem 0.75rem",
                      backgroundColor: value.tags?.includes(tag) ? "var(--accent)" : "var(--panel-2)",
                      color: value.tags?.includes(tag) ? "white" : "var(--text)",
                      border: "1px solid var(--border)",
                      borderRadius: "4px",
                      cursor: "pointer",
                      fontSize: "0.85rem",
                    }}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function getActiveFilterCount(filters: Filters, context: "inbox" | "focus"): number {
  let count = 0;

  if (context === "inbox" && filters.statuses && filters.statuses.length !== 2) {
    count++;
  }

  if (filters.projects && filters.projects.length > 0) count++;
  if (filters.tags && filters.tags.length > 0) count++;
  if (filters.due !== "any") count++;
  if (filters.energy !== "any") count++;
  if (filters.effort !== "any") count++;
  if (filters.q.length > 0) count++;

  return count;
}
