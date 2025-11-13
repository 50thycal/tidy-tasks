"use client";

import { useState } from "react";
import type { CleanTaskRequest, CleanTaskResponse } from "@/src/types";
import { SkeletonLines } from "@/src/ui/Skeleton";

interface TaskFormProps {
  onSubmit: (request: CleanTaskRequest) => Promise<CleanTaskResponse>;
  onSuccess: (result: CleanTaskResponse, request: CleanTaskRequest) => void;
}

export default function TaskForm({ onSubmit, onSuccess }: TaskFormProps) {
  const [rawText, setRawText] = useState("");
  const [today, setToday] = useState(() => new Date().toISOString().split("T")[0]);
  const [timezone, setTimezone] = useState("America/Phoenix");
  const [redactionEnabled, setRedactionEnabled] = useState(false);
  const [showOptions, setShowOptions] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!rawText.trim()) {
      setError("Please enter a task description");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const request: CleanTaskRequest = {
        raw_text: rawText,
        today,
        timezone,
        redaction: {
          enabled: redactionEnabled,
          entities: ["emails", "phones"],
        },
      };

      const result = await onSubmit(request);
      onSuccess(result, request);

      // Clear form on success
      setRawText("");
    } catch (err: any) {
      setError(err.message || "Failed to clean task");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Cmd/Ctrl + Enter to submit
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      handleSubmit(e as any);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* Main textarea */}
      <div>
        <label htmlFor="raw_text" style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500", color: "var(--text)" }}>
          Task Description
        </label>
        <textarea
          id="raw_text"
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="email brian about easement before Friday 30 min, attach grading sketch"
          rows={4}
          className="textarea"
          style={{
            fontFamily: "inherit",
            resize: "vertical",
          }}
        />
        <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: "0.25rem" }}>
          Tip: Press Cmd/Ctrl + Enter to submit
        </div>
      </div>

      {/* Optional fields (collapsible) */}
      <div>
        <button
          type="button"
          onClick={() => setShowOptions(!showOptions)}
          style={{
            background: "none",
            border: "none",
            color: "var(--accent)",
            cursor: "pointer",
            fontSize: "0.9rem",
            padding: 0,
          }}
        >
          {showOptions ? "▼ Hide Options" : "▶ Show Options"}
        </button>

        {showOptions && (
          <div
            style={{
              marginTop: "1rem",
              padding: "1rem",
              backgroundColor: "var(--panel-2)",
              borderRadius: "4px",
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
            }}
          >
            {/* Today */}
            <div>
              <label htmlFor="today" style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.9rem", color: "var(--text)" }}>
                Today (for relative dates)
              </label>
              <input
                id="today"
                type="date"
                value={today}
                onChange={(e) => setToday(e.target.value)}
                className="input"
              />
            </div>

            {/* Timezone */}
            <div>
              <label htmlFor="timezone" style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.9rem", color: "var(--text)" }}>
                Timezone
              </label>
              <input
                id="timezone"
                type="text"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                placeholder="America/Phoenix"
                className="input"
              />
            </div>

            {/* Redaction */}
            <div>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.9rem", color: "var(--text)" }}>
                <input
                  type="checkbox"
                  checked={redactionEnabled}
                  onChange={(e) => setRedactionEnabled(e.target.checked)}
                />
                Enable privacy redaction (emails, phones, names)
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div
          style={{
            padding: "0.75rem",
            backgroundColor: "color-mix(in srgb, var(--danger) 15%, transparent)",
            color: "var(--danger)",
            borderRadius: "4px",
            fontSize: "0.9rem",
            border: "1px solid var(--border)",
          }}
        >
          {error}
        </div>
      )}

      {/* Buttons */}
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button
          type="submit"
          disabled={loading}
          className="btn btn-primary"
          style={{
            padding: "0.75rem 1.5rem",
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "Processing..." : "Clean with AI"}
        </button>

        <button
          type="button"
          onClick={() => {
            setRawText("");
            setError(null);
          }}
          disabled={loading}
          style={{
            padding: "0.75rem 1.5rem",
            backgroundColor: "var(--panel-2)",
            color: "var(--text)",
            border: "1px solid var(--border)",
            borderRadius: "4px",
            fontSize: "1rem",
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          Clear
        </button>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div
          style={{
            padding: "1rem",
            backgroundColor: "var(--panel-2)",
            borderRadius: "8px",
            border: "1px solid var(--border)",
          }}
        >
          <SkeletonLines lines={5} />
        </div>
      )}
    </form>
  );
}
