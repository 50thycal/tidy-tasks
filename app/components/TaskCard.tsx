"use client";

import { useState, useEffect, KeyboardEvent } from "react";
import type { CleanTaskResponse } from "@/src/types";
import { updateInboxItemResult } from "@/src/lib/clientStore";
import { getWorkSettings } from "@/src/lib/settings";
import { validateTask } from "@/src/lib/validate";
import { coerceTags, coerceSubtasks, nullIfEmpty, clampEnum } from "@/src/lib/uiCoerce";
import { toIsoFromDateTime, splitIso } from "@/src/lib/date";
import { getQuickDateActions } from "@/src/lib/quickdates";
import { DateText } from "@/src/ui/DateText";

interface TaskCardProps {
  id?: string; // InboxItem ID for persistence
  result: CleanTaskResponse;
  status?: "inbox" | "active" | "done" | "snoozed"; // Task status for done toggle
  onToggleDone?: () => void; // Toggle done/active
  onMove?: () => void; // Move to different status
  onEdit?: () => void; // Open edit mode
  onDelete?: () => void; // Delete task
  onChange?: (patch: Partial<CleanTaskResponse>) => void; // Optional callback for parent updates
  selectable?: boolean; // Show checkbox for bulk selection
  isSelected?: boolean; // Whether this card is selected
  onToggleSelect?: () => void; // Callback when checkbox is toggled
}

export default function TaskCard({
  id,
  result,
  status,
  onToggleDone,
  onMove,
  onEdit,
  onDelete,
  onChange,
  selectable = false,
  isSelected = false,
  onToggleSelect,
}: TaskCardProps) {
  const [showJson, setShowJson] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [quickEditMode, setQuickEditMode] = useState<"importance" | "effort" | "due">("importance");
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Edit form state
  const [title, setTitle] = useState(result.title);
  const [project, setProject] = useState(result.project || "");
  const [tagsText, setTagsText] = useState((result.tags || []).join(", "));
  const [subtasksText, setSubtasksText] = useState((result.subtasks || []).join("\n"));
  const [effortMin, setEffortMin] = useState<number>(result.effort_min || 15);
  const [energy, setEnergy] = useState(result.energy || "med");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");

  // Validation errors
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  // Get settings for timezone
  const settings = getWorkSettings();

  // Initialize date/time from due_at
  useEffect(() => {
    const { date, time } = splitIso(result.due_at);
    setDueDate(date);
    setDueTime(time);
  }, [result.due_at]);

  // Reset form when entering edit mode
  const handleEdit = () => {
    setTitle(result.title);
    setProject(result.project || "");
    setTagsText((result.tags || []).join(", "));
    setSubtasksText((result.subtasks || []).join("\n"));
    setEffortMin(result.effort_min || 15);
    setEnergy(result.energy || "med");
    const { date, time } = splitIso(result.due_at);
    setDueDate(date);
    setDueTime(time);
    setFieldErrors({});
    setIsEditMode(true);
  };

  // Cancel edit
  const handleCancel = () => {
    setIsEditMode(false);
    setFieldErrors({});
  };

  // Save changes
  const handleSave = async () => {
    if (isSaving) return;

    setIsSaving(true);
    setFieldErrors({});

    try {
      // Build draft with coerced values
      const draft: Partial<CleanTaskResponse> = {
        title: title.trim(),
        project: nullIfEmpty(project),
        tags: coerceTags(tagsText),
        subtasks: coerceSubtasks(subtasksText),
        effort_min: clampEnum(effortMin, [5, 15, 30, 60, 120], 15) as 5 | 15 | 30 | 60 | 120,
        energy: energy as "low" | "med" | "high",
        due_at: toIsoFromDateTime(dueDate, dueTime, settings.timezone),
      };

      // Validate against task schema (build a minimal task object for validation)
      const taskToValidate = {
        id: id || "temp",
        title: draft.title,
        status: "inbox" as const,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        due_at: draft.due_at,
        effort_min: draft.effort_min,
        energy: draft.energy,
        project: draft.project,
        tags: draft.tags,
        subtasks: draft.subtasks,
      };

      const validationResult = validateTask(taskToValidate);

      if (!validationResult.ok) {
        setFieldErrors(validationResult.fieldErrors);
        setIsSaving(false);
        return;
      }

      // Persist to localStorage if we have an ID
      if (id) {
        updateInboxItemResult(id, draft);
      }

      // Notify parent
      if (onChange) {
        onChange(draft);
      }

      // Exit edit mode
      setIsEditMode(false);

      // Show success feedback (optional toast)
      console.log("Task saved successfully");
    } catch (error) {
      console.error("Error saving task:", error);
      setFieldErrors({ general: ["Failed to save task"] });
    } finally {
      setIsSaving(false);
    }
  };

  // Keyboard shortcuts
  const handleKeyDown = (e: KeyboardEvent, allowEnter = true) => {
    if (e.key === "Escape") {
      e.preventDefault();
      handleCancel();
    } else if (e.key === "Enter" && !e.shiftKey && allowEnter) {
      // Don't submit on Enter in textarea or when Shift is held
      e.preventDefault();
      handleSave();
    }
  };

  // Handle quick date actions
  const handleQuickDate = (action: () => string | null) => {
    if (!id) return; // Only works if we have an ID

    try {
      const newDueAt = action();

      // Update the task
      updateInboxItemResult(id, { due_at: newDueAt });

      // Notify parent to refresh
      if (onChange) {
        onChange({ due_at: newDueAt });
      }

      console.log("Updated due date:", newDueAt);
    } catch (error) {
      console.error("Error updating due date:", error);
    }
  };

  // Handle quick importance update
  const handleQuickImportance = (value: number) => {
    if (!id && !onChange) return;

    try {
      const patch = { importance: value };

      // Update the task if we have an ID
      if (id) {
        updateInboxItemResult(id, patch);
      }

      // Notify parent to refresh
      if (onChange) {
        onChange(patch);
      }

      console.log("Updated importance:", value);
    } catch (error) {
      console.error("Error updating importance:", error);
    }
  };

  // Handle quick effort update
  const handleQuickEffort = (value: number) => {
    if (!id && !onChange) return;

    try {
      const patch = { effort_min: value as 5 | 15 | 30 | 60 | 120 };

      // Update the task if we have an ID
      if (id) {
        updateInboxItemResult(id, patch);
      }

      // Notify parent to refresh
      if (onChange) {
        onChange(patch);
      }

      console.log("Updated effort:", value);
    } catch (error) {
      console.error("Error updating effort:", error);
    }
  };

  // View mode
  if (!isEditMode) {
    return (
      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: "8px",
          padding: "1rem",
          backgroundColor: "var(--panel-2)",
          color: "var(--text)",
          display: "flex",
          gap: "0.75rem",
        }}
      >
        {/* Selection checkbox */}
        {selectable && (
          <div style={{ display: "flex", alignItems: "flex-start", paddingTop: "0.125rem" }}>
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggleSelect?.()}
              onKeyDown={(e) => {
                if (e.key === ' ') {
                  e.preventDefault();
                  onToggleSelect?.();
                }
              }}
              style={{
                width: "18px",
                height: "18px",
                cursor: "pointer",
                accentColor: "var(--accent)",
              }}
              aria-label={`Select ${result.title}`}
            />
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
        {/* Title */}
        <h3 style={{ margin: "0 0 0.75rem 0", fontSize: "1.1rem", fontWeight: "600", color: "var(--text)" }}>
          {result.title}
        </h3>

        {/* Project pill (no label) */}
        {result.project && (
          <div style={{ marginBottom: "0.75rem" }}>
            <span
              style={{
                display: "inline-block",
                padding: "0.25rem 0.75rem",
                backgroundColor: "color-mix(in srgb, var(--accent-2) 20%, transparent)",
                color: "var(--accent-2)",
                borderRadius: "12px",
                fontSize: "0.85rem",
                border: "1px solid var(--border)",
                fontWeight: "500",
              }}
            >
              {result.project}
            </span>
          </div>
        )}

        {/* Due + Duration row */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "0.75rem",
            fontSize: "0.9rem",
            opacity: 0.85,
          }}
        >
          <div>
            <strong>Due:</strong>{" "}
            <DateText value={result.due_at} tz={settings.timezone} variant="long" />
          </div>
          <div>
            <strong>Duration:</strong> {result.effort_min} min
          </div>
        </div>

        {/* Quick Edit section */}
        {(id || onChange) && (
          <div
            style={{
              marginBottom: "0.75rem",
              padding: "0.75rem",
              backgroundColor: "var(--panel)",
              borderRadius: "6px",
              border: "1px solid var(--border)",
            }}
          >
            {/* Mode selector */}
            <div style={{ marginBottom: "0.75rem" }}>
              <select
                value={quickEditMode}
                onChange={(e) => setQuickEditMode(e.target.value as "importance" | "effort" | "due")}
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  backgroundColor: "var(--panel-2)",
                  color: "var(--text)",
                  border: "1px solid var(--border)",
                  borderRadius: "4px",
                  fontSize: "0.9rem",
                  cursor: "pointer",
                }}
              >
                <option value="importance">Quick Edit: Importance</option>
                <option value="effort">Quick Edit: Effort</option>
                <option value="due">Quick Edit: Due Date</option>
              </select>
            </div>

            {/* Importance mode - slider 0-100 */}
            {quickEditMode === "importance" && (
              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "0.5rem",
                  }}
                >
                  <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>Importance</span>
                  <span style={{ fontSize: "0.85rem", fontWeight: "600" }}>{result.importance}/100</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={result.importance}
                  onChange={(e) => handleQuickImportance(Number(e.target.value))}
                  style={{
                    width: "100%",
                    cursor: "pointer",
                    accentColor: "var(--accent)",
                  }}
                />
              </div>
            )}

            {/* Effort mode - slider with stops */}
            {quickEditMode === "effort" && (
              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "0.5rem",
                  }}
                >
                  <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>Effort</span>
                  <span style={{ fontSize: "0.85rem", fontWeight: "600" }}>{result.effort_min} min</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="4"
                  step="1"
                  value={[5, 15, 30, 60, 120].indexOf(result.effort_min)}
                  onChange={(e) => {
                    const efforts = [5, 15, 30, 60, 120];
                    handleQuickEffort(efforts[Number(e.target.value)]);
                  }}
                  style={{
                    width: "100%",
                    cursor: "pointer",
                    accentColor: "var(--accent)",
                  }}
                />
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "0.7rem",
                    color: "var(--muted)",
                    marginTop: "0.25rem",
                  }}
                >
                  <span>5m</span>
                  <span>15m</span>
                  <span>30m</span>
                  <span>1h</span>
                  <span>2h</span>
                </div>
              </div>
            )}

            {/* Due date mode - business day buttons */}
            {quickEditMode === "due" && id && (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                }}
              >
                {(() => {
                  const actions = getQuickDateActions(settings, result.due_at);
                  const chipStyle = {
                    padding: "0.4rem 0.75rem",
                    backgroundColor: "var(--panel-2)",
                    color: "var(--text)",
                    border: "1px solid var(--border)",
                    borderRadius: "4px",
                    fontSize: "0.8rem",
                    cursor: "pointer",
                    transition: "all 0.2s",
                    fontWeight: "500" as const,
                  };

                  return (
                    <>
                      <button
                        onClick={() => handleQuickDate(actions.today)}
                        style={chipStyle}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = "var(--accent)";
                          e.currentTarget.style.color = "white";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = "var(--panel-2)";
                          e.currentTarget.style.color = "var(--text)";
                        }}
                      >
                        Today
                      </button>
                      <button
                        onClick={() => handleQuickDate(actions.tomorrow)}
                        style={chipStyle}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = "var(--accent)";
                          e.currentTarget.style.color = "white";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = "var(--panel-2)";
                          e.currentTarget.style.color = "var(--text)";
                        }}
                      >
                        Tomorrow
                      </button>
                      <button
                        onClick={() => handleQuickDate(actions.nextFriday)}
                        style={chipStyle}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = "var(--accent)";
                          e.currentTarget.style.color = "white";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = "var(--panel-2)";
                          e.currentTarget.style.color = "var(--text)";
                        }}
                      >
                        Next {settings.eowAnchor}
                      </button>
                      <button
                        onClick={() => handleQuickDate(actions.nextWeek)}
                        style={chipStyle}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = "var(--accent)";
                          e.currentTarget.style.color = "white";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = "var(--panel-2)";
                          e.currentTarget.style.color = "var(--text)";
                        }}
                      >
                        Next Week
                      </button>
                      <button
                        onClick={() => handleQuickDate(actions.plusOneWeek)}
                        style={chipStyle}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = "var(--accent)";
                          e.currentTarget.style.color = "white";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = "var(--panel-2)";
                          e.currentTarget.style.color = "var(--text)";
                        }}
                      >
                        +1w
                      </button>
                      <button
                        onClick={() => handleQuickDate(actions.plusTwoWeeks)}
                        style={chipStyle}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = "var(--accent)";
                          e.currentTarget.style.color = "white";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = "var(--panel-2)";
                          e.currentTarget.style.color = "var(--text)";
                        }}
                      >
                        +2w
                      </button>
                      <button
                        onClick={() => handleQuickDate(actions.clear)}
                        style={{
                          ...chipStyle,
                          color: "var(--danger)",
                          borderColor: "var(--danger)",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = "var(--danger)";
                          e.currentTarget.style.color = "white";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = "var(--panel-2)";
                          e.currentTarget.style.color = "var(--danger)";
                        }}
                      >
                        Clear
                      </button>
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {/* Importance bar + Energy pill row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "1rem",
            marginBottom: "0.75rem",
          }}
        >
          {/* Importance bar */}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "0.85rem", marginBottom: "0.25rem", color: "var(--muted)" }}>
              <strong>Importance:</strong> {result.importance}/100
            </div>
            <div
              style={{
                height: "6px",
                backgroundColor: "var(--panel)",
                borderRadius: "3px",
                overflow: "hidden",
                border: "1px solid var(--border)",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${result.importance}%`,
                  backgroundColor:
                    result.importance > 75
                      ? "var(--danger)"
                      : result.importance > 50
                      ? "var(--warn)"
                      : "var(--accent-2)",
                }}
              />
            </div>
          </div>

          {/* Energy pill */}
          <div>
            <span
              style={{
                display: "inline-block",
                padding: "0.35rem 0.75rem",
                backgroundColor:
                  result.energy === "high"
                    ? "color-mix(in srgb, var(--danger) 20%, transparent)"
                    : result.energy === "med"
                    ? "color-mix(in srgb, var(--warn) 20%, transparent)"
                    : "color-mix(in srgb, var(--accent) 20%, transparent)",
                color:
                  result.energy === "high"
                    ? "var(--danger)"
                    : result.energy === "med"
                    ? "var(--warn)"
                    : "var(--accent)",
                borderRadius: "12px",
                fontSize: "0.75rem",
                border: "1px solid var(--border)",
                fontWeight: "600",
                textTransform: "uppercase",
              }}
            >
              {result.energy}
            </span>
          </div>
        </div>

        {/* Collapsible More info section */}
        {((result.tags && result.tags.length > 0) ||
          (result.subtasks && result.subtasks.length > 0) ||
          result.notes_append) && (
          <div style={{ marginBottom: "0.75rem" }}>
            <button
              onClick={() => setShowDetails(!showDetails)}
              style={{
                background: "none",
                border: "none",
                color: "var(--accent)",
                cursor: "pointer",
                fontSize: "0.85rem",
                padding: "0.25rem 0",
                fontWeight: "500",
              }}
            >
              {showDetails ? "▼ Hide Details" : "▶ More Info"}
            </button>

            {showDetails && (
              <div
                style={{
                  marginTop: "0.5rem",
                  padding: "0.75rem",
                  backgroundColor: "var(--panel)",
                  borderRadius: "6px",
                  border: "1px solid var(--border)",
                }}
              >
                {/* Tags */}
                {result.tags && result.tags.length > 0 && (
                  <div style={{ marginBottom: result.subtasks || result.notes_append ? "0.75rem" : "0" }}>
                    <strong style={{ fontSize: "0.85rem", color: "var(--muted)", display: "block", marginBottom: "0.5rem" }}>
                      Tags
                    </strong>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                      {result.tags.map((tag, idx) => (
                        <span
                          key={idx}
                          style={{
                            padding: "2px 8px",
                            backgroundColor: "color-mix(in srgb, var(--accent) 15%, transparent)",
                            color: "var(--accent)",
                            borderRadius: "4px",
                            fontSize: "0.75rem",
                            border: "1px solid var(--border)",
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Subtasks */}
                {result.subtasks && result.subtasks.length > 0 && (
                  <div style={{ marginBottom: result.notes_append ? "0.75rem" : "0" }}>
                    <strong style={{ fontSize: "0.85rem", color: "var(--muted)", display: "block", marginBottom: "0.5rem" }}>
                      Subtasks
                    </strong>
                    <ul style={{ margin: 0, padding: "0 0 0 1.25rem", fontSize: "0.85rem" }}>
                      {result.subtasks.map((subtask, idx) => (
                        <li key={idx} style={{ marginBottom: "0.25rem" }}>{subtask}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Notes */}
                {result.notes_append && (
                  <div>
                    <strong style={{ fontSize: "0.85rem", color: "var(--muted)", display: "block", marginBottom: "0.5rem" }}>
                      Note
                    </strong>
                    <div
                      style={{
                        padding: "0.5rem",
                        backgroundColor: "color-mix(in srgb, var(--warn) 10%, transparent)",
                        borderRadius: "4px",
                        fontSize: "0.85rem",
                        border: "1px solid var(--border)",
                      }}
                    >
                      {result.notes_append}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Actions row - always rendered */}
        <div
          style={{
            marginTop: "0.75rem",
            borderTop: "1px solid var(--border)",
            paddingTop: "0.5rem",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: "0.5rem",
            fontSize: "0.875rem",
          }}
        >
          {/* Mark done / Mark as active */}
          <button
            type="button"
            onClick={onToggleDone || (() => {})}
            disabled={!onToggleDone}
            style={{
              borderRadius: "6px",
              border: "1px solid var(--border)",
              backgroundColor: "var(--background)",
              padding: "0.25rem 0.75rem",
              color: "var(--text)",
              cursor: onToggleDone ? "pointer" : "not-allowed",
              opacity: onToggleDone ? 1 : 0.5,
            }}
            onMouseEnter={(e) => {
              if (onToggleDone) {
                e.currentTarget.style.backgroundColor = "var(--muted)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "var(--background)";
            }}
          >
            {status === "done" ? "Mark as active" : "Mark done"}
          </button>

          {/* Move */}
          <button
            type="button"
            onClick={onMove || (() => {})}
            disabled={!onMove}
            style={{
              borderRadius: "6px",
              border: "1px solid var(--border)",
              backgroundColor: "var(--background)",
              padding: "0.25rem 0.75rem",
              color: "var(--text)",
              cursor: onMove ? "pointer" : "not-allowed",
              opacity: onMove ? 1 : 0.5,
            }}
            onMouseEnter={(e) => {
              if (onMove) {
                e.currentTarget.style.backgroundColor = "var(--muted)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "var(--background)";
            }}
          >
            Move
          </button>

          {/* Edit */}
          <button
            type="button"
            onClick={onEdit || handleEdit}
            style={{
              borderRadius: "6px",
              border: "1px solid var(--border)",
              backgroundColor: "var(--background)",
              padding: "0.25rem 0.75rem",
              color: "var(--text)",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--muted)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "var(--background)";
            }}
          >
            Edit
          </button>

          {/* Delete */}
          <button
            type="button"
            onClick={onDelete || (() => {})}
            disabled={!onDelete}
            style={{
              borderRadius: "6px",
              border: "1px solid color-mix(in srgb, var(--danger) 50%, transparent)",
              backgroundColor: "var(--background)",
              padding: "0.25rem 0.75rem",
              color: "var(--danger)",
              cursor: onDelete ? "pointer" : "not-allowed",
              opacity: onDelete ? 1 : 0.5,
            }}
            onMouseEnter={(e) => {
              if (onDelete) {
                e.currentTarget.style.backgroundColor = "color-mix(in srgb, var(--danger) 10%, transparent)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "var(--background)";
            }}
          >
            Delete
          </button>
        </div>

        {/* Collapsible JSON */}
        <div style={{ marginTop: "1rem", borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
          <button
            onClick={() => setShowJson(!showJson)}
            style={{
              background: "none",
              border: "none",
              color: "var(--accent)",
              cursor: "pointer",
              fontSize: "0.85rem",
              padding: 0,
            }}
          >
            {showJson ? "▼ Hide JSON" : "▶ Show JSON"}
          </button>
          {showJson && (
            <pre
              style={{
                marginTop: "0.5rem",
                padding: "0.75rem",
                backgroundColor: "var(--panel)",
                borderRadius: "4px",
                fontSize: "0.75rem",
                overflow: "auto",
                maxHeight: "300px",
                border: "1px solid var(--border)",
              }}
            >
              {JSON.stringify(result, null, 2)}
            </pre>
          )}
        </div>
        </div>
      </div>
    );
  }

  // Edit mode
  const inputStyle = {
    width: "100%",
    backgroundColor: "var(--panel-2)",
    color: "var(--text)",
    border: "1px solid var(--border)",
    borderRadius: "8px",
    padding: "0.75rem",
    fontSize: "1rem",
    fontFamily: "inherit",
  };

  const errorStyle = {
    color: "var(--danger)",
    fontSize: "0.85rem",
    marginTop: "0.25rem",
  };

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: "8px",
        padding: "1rem",
        backgroundColor: "var(--panel-2)",
        color: "var(--text)",
      }}
    >
      {/* General errors */}
      {fieldErrors.general && (
        <div style={{ ...errorStyle, marginBottom: "1rem" }}>
          {fieldErrors.general.map((err, idx) => (
            <div key={idx}>{err}</div>
          ))}
        </div>
      )}

      {/* Title */}
      <div style={{ marginBottom: "1rem" }}>
        <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "600" }}>
          Title
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => handleKeyDown(e)}
          style={inputStyle}
          placeholder="Enter task title"
        />
        {fieldErrors.title && (
          <div style={errorStyle}>
            {fieldErrors.title.map((err, idx) => (
              <div key={idx}>{err}</div>
            ))}
          </div>
        )}
      </div>

      {/* Project */}
      <div style={{ marginBottom: "1rem" }}>
        <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "600" }}>
          Project (optional)
        </label>
        <input
          type="text"
          value={project}
          onChange={(e) => setProject(e.target.value)}
          onKeyDown={(e) => handleKeyDown(e)}
          style={inputStyle}
          placeholder="Enter project name"
        />
        {fieldErrors.project && (
          <div style={errorStyle}>
            {fieldErrors.project.map((err, idx) => (
              <div key={idx}>{err}</div>
            ))}
          </div>
        )}
      </div>

      {/* Due Date & Time */}
      <div style={{ marginBottom: "1rem" }}>
        <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "600" }}>
          Due Date & Time (optional)
        </label>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            onKeyDown={(e) => handleKeyDown(e)}
            style={{ ...inputStyle, flex: 1 }}
          />
          <input
            type="time"
            value={dueTime}
            onChange={(e) => setDueTime(e.target.value)}
            onKeyDown={(e) => handleKeyDown(e)}
            style={{ ...inputStyle, flex: 1 }}
          />
        </div>
        {fieldErrors.due_at && (
          <div style={errorStyle}>
            {fieldErrors.due_at.map((err, idx) => (
              <div key={idx}>{err}</div>
            ))}
          </div>
        )}
      </div>

      {/* Effort */}
      <div style={{ marginBottom: "1rem" }}>
        <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "600" }}>
          Effort (minutes)
        </label>
        <select
          value={effortMin}
          onChange={(e) => setEffortMin(Number(e.target.value))}
          onKeyDown={(e) => handleKeyDown(e)}
          style={inputStyle}
        >
          <option value={5}>5 min</option>
          <option value={15}>15 min</option>
          <option value={30}>30 min</option>
          <option value={60}>60 min</option>
          <option value={120}>120 min</option>
        </select>
        {fieldErrors.effort_min && (
          <div style={errorStyle}>
            {fieldErrors.effort_min.map((err, idx) => (
              <div key={idx}>{err}</div>
            ))}
          </div>
        )}
      </div>

      {/* Energy */}
      <div style={{ marginBottom: "1rem" }}>
        <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "600" }}>
          Energy Level
        </label>
        <select
          value={energy}
          onChange={(e) => setEnergy(e.target.value as "low" | "med" | "high")}
          onKeyDown={(e) => handleKeyDown(e)}
          style={inputStyle}
        >
          <option value="low">Low</option>
          <option value="med">Medium</option>
          <option value="high">High</option>
        </select>
        {fieldErrors.energy && (
          <div style={errorStyle}>
            {fieldErrors.energy.map((err, idx) => (
              <div key={idx}>{err}</div>
            ))}
          </div>
        )}
      </div>

      {/* Tags */}
      <div style={{ marginBottom: "1rem" }}>
        <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "600" }}>
          Tags (comma-separated)
        </label>
        <input
          type="text"
          value={tagsText}
          onChange={(e) => setTagsText(e.target.value)}
          onKeyDown={(e) => handleKeyDown(e)}
          style={inputStyle}
          placeholder="work, urgent, email"
        />
        {fieldErrors.tags && (
          <div style={errorStyle}>
            {fieldErrors.tags.map((err, idx) => (
              <div key={idx}>{err}</div>
            ))}
          </div>
        )}
      </div>

      {/* Subtasks */}
      <div style={{ marginBottom: "1rem" }}>
        <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "600" }}>
          Subtasks (one per line)
        </label>
        <textarea
          value={subtasksText}
          onChange={(e) => setSubtasksText(e.target.value)}
          onKeyDown={(e) => handleKeyDown(e, false)} // Don't submit on Enter in textarea
          style={{ ...inputStyle, minHeight: "100px", resize: "vertical" }}
          placeholder="Step 1&#10;Step 2&#10;Step 3"
        />
        {fieldErrors.subtasks && (
          <div style={errorStyle}>
            {fieldErrors.subtasks.map((err, idx) => (
              <div key={idx}>{err}</div>
            ))}
          </div>
        )}
      </div>

      {/* Save/Cancel buttons */}
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button
          onClick={handleSave}
          disabled={isSaving}
          style={{
            padding: "0.5rem 1rem",
            backgroundColor: isSaving ? "var(--muted)" : "var(--accent-2)",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: isSaving ? "not-allowed" : "pointer",
            fontSize: "0.9rem",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          {isSaving && <span>⏳</span>}
          Save
        </button>
        <button
          onClick={handleCancel}
          disabled={isSaving}
          style={{
            padding: "0.5rem 1rem",
            backgroundColor: "var(--panel)",
            color: "var(--text)",
            border: "1px solid var(--border)",
            borderRadius: "4px",
            cursor: isSaving ? "not-allowed" : "pointer",
            fontSize: "0.9rem",
          }}
        >
          Cancel
        </button>
      </div>

      <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: "0.75rem" }}>
        Press Enter to save, Esc to cancel
      </div>
    </div>
  );
}
