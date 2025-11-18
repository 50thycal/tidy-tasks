"use client";

import { useState } from "react";
import { saveInboxItem, type InboxItem } from "@/src/lib/clientStore";
import { getWorkSettings } from "@/src/lib/settings";
import { inc } from "@/src/db/metrics";
import type { CleanTaskResponse } from "@/src/types";

interface FloatingAddTaskButtonProps {
  defaultBucket?: "inbox" | "now";
  onTaskAdded?: () => void;
}

export function FloatingAddTaskButton({ defaultBucket = "inbox", onTaskAdded }: FloatingAddTaskButtonProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [project, setProject] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || loading) return;

    setLoading(true);

    try {
      const settings = getWorkSettings();

      // Create a simple task without AI cleanup
      const taskResult: CleanTaskResponse = {
        title: title.trim(),
        project: project.trim() || null,
        tags: [],
        subtasks: [],
        due_at: null,
        effort_min: 30,
        energy: "med",
        importance: 50,
      };

      const newItem: InboxItem = {
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        request: {
          raw_text: title,
          timezone: settings.timezone,
          today: new Date().toISOString().split("T")[0],
        },
        result: taskResult,
        status: defaultBucket === "inbox" ? "inbox" : "active",
      };

      // If it's going to "now" bucket, we need to set it as active with a custom property
      if (defaultBucket === "now") {
        (newItem as any).bucket = "now";
      }

      saveInboxItem(newItem);
      await inc('tasksCreated');

      // Close modal and reset
      setOpen(false);
      setTitle("");
      setProject("");

      // Notify parent to refresh
      onTaskAdded?.();
    } catch (error) {
      console.error("Error creating task:", error);
      alert("Failed to create task");
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
              setTitle("");
              setProject("");
            }
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "var(--panel-2)",
              borderRadius: "8px",
              padding: "1.5rem",
              maxWidth: "400px",
              width: "100%",
              border: "1px solid var(--border)",
            }}
          >
            <h3 style={{ margin: "0 0 1rem 0", fontSize: "1.125rem", fontWeight: "600" }}>
              Add task
            </h3>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <label
                  htmlFor="task-title"
                  style={{
                    display: "block",
                    fontSize: "0.75rem",
                    fontWeight: "500",
                    color: "var(--muted)",
                    marginBottom: "0.375rem",
                  }}
                >
                  Title
                </label>
                <input
                  id="task-title"
                  type="text"
                  autoFocus
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Write the task…"
                  disabled={loading}
                  style={{
                    width: "100%",
                    padding: "0.625rem",
                    backgroundColor: "var(--panel)",
                    color: "var(--text)",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    fontSize: "0.875rem",
                    fontFamily: "inherit",
                  }}
                />
              </div>

              <div>
                <label
                  htmlFor="task-project"
                  style={{
                    display: "block",
                    fontSize: "0.75rem",
                    fontWeight: "500",
                    color: "var(--muted)",
                    marginBottom: "0.375rem",
                  }}
                >
                  Project (optional)
                </label>
                <input
                  id="task-project"
                  type="text"
                  value={project}
                  onChange={(e) => setProject(e.target.value)}
                  placeholder="Project name"
                  disabled={loading}
                  style={{
                    width: "100%",
                    padding: "0.625rem",
                    backgroundColor: "var(--panel)",
                    color: "var(--text)",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    fontSize: "0.875rem",
                    fontFamily: "inherit",
                  }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", paddingTop: "0.25rem" }}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setTitle("");
                    setProject("");
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
                  disabled={!title.trim() || loading}
                  style={{
                    padding: "0.5rem 1rem",
                    backgroundColor: !title.trim() || loading ? "var(--muted)" : "var(--accent)",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    fontSize: "0.875rem",
                    cursor: !title.trim() || loading ? "not-allowed" : "pointer",
                    fontWeight: "500",
                  }}
                >
                  {loading ? "Adding..." : "Add"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
