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
  showActions?: boolean;
  onMoveToActive?: () => void;
  onDelete?: () => void;
  onChange?: (patch: Partial<CleanTaskResponse>) => void; // Optional callback for parent updates
  selectable?: boolean; // Show checkbox for bulk selection
  isSelected?: boolean; // Whether this card is selected
  onToggleSelect?: () => void; // Callback when checkbox is toggled
}

export default function TaskCard({
  id,
  result,
  showActions = false,
  onMoveToActive,
  onDelete,
  onChange,
  selectable = false,
  isSelected = false,
  onToggleSelect,
}: TaskCardProps) {
  const [showJson, setShowJson] = useState(false);
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
        <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1.1rem", fontWeight: "600", color: "var(--text)" }}>
          {result.title}
        </h3>

        {/* Quick date chips */}
        {id && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.5rem",
              marginBottom: "0.75rem",
              paddingBottom: "0.75rem",
              borderBottom: "1px solid var(--border)",
            }}
          >
            {(() => {
              const actions = getQuickDateActions(settings, result.due_at);
              const chipStyle = {
                padding: "0.25rem 0.75rem",
                backgroundColor: "var(--panel)",
                color: "var(--text)",
                border: "1px solid var(--border)",
                borderRadius: "4px",
                fontSize: "0.75rem",
                cursor: "pointer",
                transition: "all 0.2s",
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
                      e.currentTarget.style.backgroundColor = "var(--panel)";
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
                      e.currentTarget.style.backgroundColor = "var(--panel)";
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
                      e.currentTarget.style.backgroundColor = "var(--panel)";
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
                      e.currentTarget.style.backgroundColor = "var(--panel)";
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
                      e.currentTarget.style.backgroundColor = "var(--panel)";
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
                      e.currentTarget.style.backgroundColor = "var(--panel)";
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
                      e.currentTarget.style.backgroundColor = "var(--panel)";
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

        {/* Due date */}
        <div style={{ fontSize: "0.9rem", opacity: 0.7, marginBottom: "0.75rem" }}>
          <strong>Due:</strong> <DateText value={result.due_at} tz={settings.timezone} variant="long" />
        </div>

        {/* Effort & Energy */}
        <div
          style={{
            display: "flex",
            gap: "1rem",
            marginBottom: "0.75rem",
            fontSize: "0.9rem",
            opacity: 0.9,
          }}
        >
          <span>
            <strong>Effort:</strong> {result.effort_min} min
          </span>
          <span>
            <strong>Energy:</strong> {result.energy}
          </span>
        </div>

        {/* Importance bar */}
        <div style={{ marginBottom: "0.75rem" }}>
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
                backgroundColor: result.importance > 75 ? "var(--danger)" : result.importance > 50 ? "var(--warn)" : "var(--accent-2)",
              }}
            />
          </div>
        </div>

        {/* Project */}
        {result.project && (
          <div style={{ fontSize: "0.9rem", marginBottom: "0.75rem", opacity: 0.9 }}>
            <strong>Project:</strong> {result.project}
          </div>
        )}

        {/* Tags */}
        {result.tags && result.tags.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.75rem" }}>
            {result.tags.map((tag, idx) => (
              <span
                key={idx}
                style={{
                  padding: "2px 8px",
                  backgroundColor: "color-mix(in srgb, var(--accent) 15%, transparent)",
                  color: "var(--accent)",
                  borderRadius: "4px",
                  fontSize: "12px",
                  border: "1px solid var(--border)",
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Subtasks */}
        {result.subtasks && result.subtasks.length > 0 && (
          <div style={{ marginBottom: "0.75rem", opacity: 0.9 }}>
            <strong style={{ fontSize: "0.9rem" }}>Subtasks:</strong>
            <ul style={{ margin: "0.25rem 0 0 1.5rem", padding: 0, fontSize: "0.9rem" }}>
              {result.subtasks.map((subtask, idx) => (
                <li key={idx}>{subtask}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Notes append */}
        {result.notes_append && (
          <div
            style={{
              padding: "0.5rem",
              backgroundColor: "color-mix(in srgb, var(--warn) 15%, transparent)",
              borderRadius: "4px",
              fontSize: "0.85rem",
              marginBottom: "0.75rem",
              border: "1px solid var(--border)",
            }}
          >
            <strong>Note:</strong> {result.notes_append}
          </div>
        )}

        {/* Edit button */}
        {id && !selectable && (
          <div style={{ marginBottom: "0.75rem" }}>
            <button
              onClick={handleEdit}
              style={{
                padding: "0.5rem 1rem",
                backgroundColor: "var(--panel)",
                color: "var(--text)",
                border: "1px solid var(--border)",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "0.9rem",
              }}
            >
              Edit
            </button>
          </div>
        )}

        {/* Actions */}
        {showActions && (
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
            {onMoveToActive && (
              <button
                onClick={onMoveToActive}
                style={{
                  padding: "0.5rem 1rem",
                  backgroundColor: "var(--accent-2)",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "0.9rem",
                }}
              >
                Move to Active
              </button>
            )}
            {onDelete && (
              <button
                onClick={onDelete}
                style={{
                  padding: "0.5rem 1rem",
                  backgroundColor: "var(--danger)",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "0.9rem",
                }}
              >
                Delete
              </button>
            )}
          </div>
        )}

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
