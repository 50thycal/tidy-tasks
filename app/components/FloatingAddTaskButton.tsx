"use client";

import { useState } from "react";
import { saveInboxItem, type InboxItem } from "@/src/lib/clientStore";
import { getWorkSettings, getWorkSettingsV2 } from "@/src/lib/settings";
import { inc } from "@/src/db/metrics";
import type { CleanTaskResponse, CleanTaskRequest } from "@/src/types";

interface FloatingAddTaskButtonProps {
  defaultBucket?: "inbox" | "now";
  onTaskAdded?: () => void;
}

export function FloatingAddTaskButton({ defaultBucket = "inbox", onTaskAdded }: FloatingAddTaskButtonProps) {
  const [open, setOpen] = useState(false);
  const [messyText, setMessyText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!messyText.trim() || loading) return;

    setLoading(true);
    setError(null);

    try {
      const settings = getWorkSettings();
      const today = new Date().toISOString().split("T")[0];

      // Get privacy settings from global settings (V2)
      const settingsV2 = getWorkSettingsV2();
      const privacyEnabled = settingsV2.privacy?.enabled ?? false;
      const redactionMode = settingsV2.privacy?.redactionMode ?? "emails_phones";

      // Map redaction mode to entities array
      let redactionEntities: Array<"emails" | "phones" | "proper_names"> = [];
      if (privacyEnabled) {
        if (redactionMode === "emails_phones") {
          redactionEntities = ["emails", "phones"];
        } else if (redactionMode === "emails_phones_names") {
          redactionEntities = ["emails", "phones", "proper_names"];
        }
      }

      // Build request for AI cleanup
      const request: CleanTaskRequest = {
        raw_text: messyText.trim(),
        today,
        timezone: settings.timezone,
        redaction: {
          enabled: privacyEnabled,
          entities: redactionEntities,
        },
      };

      // Call AI cleanup endpoint
      const response = await fetch("/api/ai/clean_task", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ...request, settings }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const taskResult: CleanTaskResponse = await response.json();

      // Create inbox item with AI-cleaned task
      const newItem: InboxItem = {
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        request,
        result: taskResult,
        status: defaultBucket === "inbox" ? "inbox" : "active",
      };

      // If it's going to "now" bucket, set the bucket property
      if (defaultBucket === "now") {
        (newItem as any).bucket = "now";
      }

      saveInboxItem(newItem);
      await inc('tasksCreated');
      await inc('aiCleans');

      // Close modal and reset
      setOpen(false);
      setMessyText("");
      setError(null);

      // Notify parent to refresh
      onTaskAdded?.();
    } catch (error) {
      console.error("Error creating task:", error);
      setError(error instanceof Error ? error.message : "Failed to create task");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Floating Action Button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          position: "fixed",
          bottom: "1rem",
          right: "1rem",
          zIndex: 30,
          width: "3.5rem",
          height: "3.5rem",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "50%",
          backgroundColor: "var(--accent)",
          color: "white",
          border: "none",
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
          cursor: "pointer",
          fontSize: "1.75rem",
          transition: "all 0.2s",
        }}
        className="md:bottom-6 md:right-6"
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "scale(1.1)";
          e.currentTarget.style.boxShadow = "0 6px 16px rgba(0, 0, 0, 0.4)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "scale(1)";
          e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.3)";
        }}
        aria-label="Add task"
      >
        +
      </button>

      {/* Modal */}
      {open && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "1rem",
          }}
          onClick={() => {
            if (!loading) {
              setOpen(false);
              setMessyText("");
              setError(null);
            }
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "var(--panel-2)",
              borderRadius: "8px",
              padding: "1.5rem",
              maxWidth: "500px",
              width: "100%",
              border: "1px solid var(--border)",
            }}
          >
            <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1.125rem", fontWeight: "600" }}>
              Quick Add Task
            </h3>
            <p style={{ margin: "0 0 1rem 0", fontSize: "0.8rem", color: "var(--muted)" }}>
              Write your task in natural language. AI will clean it up and extract details.
            </p>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <textarea
                  autoFocus
                  value={messyText}
                  onChange={(e) => setMessyText(e.target.value)}
                  placeholder="e.g., 'call john tomorrow about the api keys' or 'buy milk on friday'"
                  disabled={loading}
                  rows={4}
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    backgroundColor: "var(--panel)",
                    color: "var(--text)",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    fontSize: "0.875rem",
                    fontFamily: "inherit",
                    resize: "vertical",
                  }}
                />
              </div>

              {error && (
                <div
                  style={{
                    padding: "0.75rem",
                    backgroundColor: "color-mix(in srgb, var(--danger) 15%, transparent)",
                    color: "var(--danger)",
                    borderRadius: "6px",
                    fontSize: "0.85rem",
                    border: "1px solid var(--danger)",
                  }}
                >
                  {error}
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", paddingTop: "0.25rem" }}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setMessyText("");
                    setError(null);
                  }}
                  disabled={loading}
                  style={{
                    padding: "0.5rem 1rem",
                    backgroundColor: "var(--panel)",
                    color: "var(--text)",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    fontSize: "0.875rem",
                    cursor: loading ? "not-allowed" : "pointer",
                    fontWeight: "500",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!messyText.trim() || loading}
                  style={{
                    padding: "0.5rem 1rem",
                    backgroundColor: !messyText.trim() || loading ? "var(--muted)" : "var(--accent)",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    fontSize: "0.875rem",
                    cursor: !messyText.trim() || loading ? "not-allowed" : "pointer",
                    fontWeight: "500",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  {loading && <span style={{ fontSize: "1rem" }}>⏳</span>}
                  {loading ? "Cleaning with AI..." : "Clean & Add Task"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
