"use client";

import { useState, useEffect, KeyboardEvent } from "react";
import type { CleanTaskResponse } from "@/src/types";
import { updateInboxItemResult, updateInboxItemStatus } from "@/src/lib/clientStore";
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
  const [showDetails, setShowDetails] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Inline editing states
  const [isEditingImportance, setIsEditingImportance] = useState(false);
  const [isEditingDuration, setIsEditingDuration] = useState(false);
  const [isEditingEnergy, setIsEditingEnergy] = useState(false);
  const [showDueQuickEdit, setShowDueQuickEdit] = useState(false);

  // Edit form state
  const [title, setTitle] = useState(result.title);
  const [project, setProject] = useState(result.project || "");
  const [tagsText, setTagsText] = useState((result.tags || []).join(", "));
  const [subtasksText, setSubtasksText] = useState((result.subtasks || []).join("\n"));
  const [notes, setNotes] = useState(result.notes_append || "");
  const [effortMin, setEffortMin] = useState<number>(result.effort_min || 15);
  const [energy, setEnergy] = useState(result.energy || "med");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");

  // Validation errors
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  // Get settings for timezone
  const settings = getWorkSettings();

  // Duration options and formatting
  const EFFORT_OPTIONS = [5, 15, 30, 60, 90, 120];

  const formatDuration = (minutes: number): string => {
    if (minutes <= 30) {
      return `${minutes} min`;
    } else if (minutes < 90) {
      return "1 hr";
    } else if (minutes < 120) {
      return "1.5 hr";
    } else {
      return "2 hr +";
    }
  };

  const getDurationLabel = (minutes: number): string => {
    switch (minutes) {
      case 5: return "5 min";
      case 15: return "15 min";
      case 30: return "30 min";
      case 60: return "1 hr";
      case 90: return "1.5 hr";
      case 120: return "2 hr +";
      default: return formatDuration(minutes);
    }
  };

  // Close move menu on click outside
  useEffect(() => {
    if (!showMoveMenu) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-move-menu]')) {
        setShowMoveMenu(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showMoveMenu]);

  // Close energy picker on click outside
  useEffect(() => {
    if (!isEditingEnergy) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const energySection = target.closest('[data-energy-edit]');
      if (!energySection) {
        setIsEditingEnergy(false);
      }
    };

    // Small delay to prevent immediate closing when opening
    setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 0);

    return () => document.removeEventListener('click', handleClickOutside);
  }, [isEditingEnergy]);

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
    setNotes(result.notes_append || "");
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
        notes_append: notes.trim() || undefined,
        effort_min: clampEnum(effortMin, [5, 15, 30, 60, 90, 120], 15) as 5 | 15 | 30 | 60 | 90 | 120,
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
      const patch = { effort_min: value as 5 | 15 | 30 | 60 | 90 | 120 };

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

  // Handle quick energy update
  const handleQuickEnergy = (value: "low" | "med" | "high") => {
    if (!id && !onChange) return;

    try {
      const patch = { energy: value };

      // Update the task if we have an ID
      if (id) {
        updateInboxItemResult(id, patch);
      }

      // Notify parent to refresh
      if (onChange) {
        onChange(patch);
      }

      console.log("Updated energy:", value);
    } catch (error) {
      console.error("Error updating energy:", error);
    }
  };

  // Helper: Add business days to a date
  const addBusinessDays = (startDate: Date, daysToAdd: number): string => {
    // Handle both V1 (workDays) and V2 (work_days) settings
    const workDaysArray: string[] = ('work_days' in settings
      ? settings.work_days
      : (settings.workDays || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'])) as string[];

    const workDayNumbers = workDaysArray.map(day => {
      const map: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
      return map[day.toLowerCase()];
    });

    let currentDate = new Date(startDate);
    let addedDays = 0;

    while (addedDays < daysToAdd) {
      currentDate.setDate(currentDate.getDate() + 1);
      if (workDayNumbers.includes(currentDate.getDay())) {
        addedDays++;
      }
    }

    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    // Use end of day time
    const [hours, minutes] = settings.endOfDay.split(':');
    return `${dateStr}T${hours}:${minutes}:00${getTimezoneOffset(currentDate)}`;
  };

  // Helper: Get timezone offset string
  const getTimezoneOffset = (date: Date): string => {
    const offset = date.getTimezoneOffset();
    const offsetHours = Math.floor(Math.abs(offset) / 60);
    const offsetMinutes = Math.abs(offset) % 60;
    const offsetSign = offset <= 0 ? '+' : '-';
    return `${offsetSign}${String(offsetHours).padStart(2, '0')}:${String(offsetMinutes).padStart(2, '0')}`;
  };

  // Handle quick date updates with business days
  const handleQuickDateBD = (businessDays: number) => {
    if (!id && !onChange) return;

    try {
      const now = new Date();
      const newDueAt = addBusinessDays(now, businessDays);

      // Update the task
      if (id) {
        updateInboxItemResult(id, { due_at: newDueAt });
      }

      // Notify parent
      if (onChange) {
        onChange({ due_at: newDueAt });
      }

      console.log("Updated due date:", newDueAt);
    } catch (error) {
      console.error("Error updating due date:", error);
    }
  };

  // Handle date picker change
  const handleDatePickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!id && !onChange) return;

    try {
      const selectedDate = e.target.value; // YYYY-MM-DD
      if (!selectedDate) return;

      const [hours, minutes] = settings.endOfDay.split(':');
      const newDueAt = `${selectedDate}T${hours}:${minutes}:00${getTimezoneOffset(new Date(selectedDate))}`;

      // Update the task
      if (id) {
        updateInboxItemResult(id, { due_at: newDueAt });
      }

      // Notify parent
      if (onChange) {
        onChange({ due_at: newDueAt });
      }

      setShowDatePicker(false);
      console.log("Updated due date:", newDueAt);
    } catch (error) {
      console.error("Error updating due date:", error);
    }
  };

  // Handle move to specific bucket/status
  const handleMoveTo = (destination: "inbox" | "now" | "next" | "later" | "backlog") => {
    if (!id) return;

    try {
      // Update status based on destination
      if (destination === "inbox") {
        updateInboxItemStatus(id, "inbox");
      } else {
        // For now/next/later/backlog, set status to active
        updateInboxItemStatus(id, "active");
      }

      // Store bucket in a custom property (not part of CleanTaskResponse schema)
      // This is handled separately by the Focus page logic
      const customUpdate = { ...result };
      (customUpdate as any).bucket = destination;

      // Notify parent if onChange provided
      if (onChange) {
        onChange(customUpdate);
      }

      // Close the menu
      setShowMoveMenu(false);

      console.log(`Moved task to ${destination}`);
    } catch (error) {
      console.error("Error moving task:", error);
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
          {/* Due date - clickable to expand quick edit */}
          <div>
            <strong>Due:</strong>{" "}
            {(id || onChange) ? (
              <span
                onClick={() => setShowDueQuickEdit(!showDueQuickEdit)}
                style={{ cursor: "pointer", textDecoration: "underline", textDecorationStyle: "dotted" }}
                title="Click to edit due date"
              >
                <DateText value={result.due_at} tz={settings.timezone} variant="short" />
              </span>
            ) : (
              <DateText value={result.due_at} tz={settings.timezone} variant="short" />
            )}
          </div>

          {/* Duration - clickable for inline editing */}
          <div>
            <strong>Duration:</strong>{" "}
            {!isEditingDuration && (id || onChange) ? (
              <span
                onClick={() => setIsEditingDuration(true)}
                style={{ cursor: "pointer", textDecoration: "underline", textDecorationStyle: "dotted" }}
                title="Click to edit duration"
              >
                {formatDuration(result.effort_min)}
              </span>
            ) : (id || onChange) ? (
              <select
                value={result.effort_min}
                onChange={(e) => {
                  handleQuickEffort(Number(e.target.value));
                  setIsEditingDuration(false);
                }}
                onBlur={() => setIsEditingDuration(false)}
                autoFocus
                style={{
                  padding: "0.25rem 0.5rem",
                  backgroundColor: "var(--panel-2)",
                  color: "var(--text)",
                  border: "1px solid var(--border)",
                  borderRadius: "4px",
                  fontSize: "0.9rem",
                  cursor: "pointer",
                }}
              >
                {EFFORT_OPTIONS.map(minutes => (
                  <option key={minutes} value={minutes}>
                    {getDurationLabel(minutes)}
                  </option>
                ))}
              </select>
            ) : (
              <span>{formatDuration(result.effort_min)}</span>
            )}
          </div>
        </div>

        {/* Quick date edit - expands when due date clicked */}
        {showDueQuickEdit && (id || onChange) && (
          <div
            style={{
              marginBottom: "0.75rem",
              padding: "0.75rem",
              backgroundColor: "var(--panel)",
              borderRadius: "6px",
              border: "1px solid var(--border)",
            }}
          >
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
                    {/* Today */}
                    <button
                      onClick={() => {
                        handleQuickDate(actions.today);
                        setShowDueQuickEdit(false);
                      }}
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

                    {/* +1 BD */}
                    <button
                      onClick={() => {
                        handleQuickDateBD(1);
                        setShowDueQuickEdit(false);
                      }}
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
                      +1 BD
                    </button>

                    {/* +2 BD */}
                    <button
                      onClick={() => {
                        handleQuickDateBD(2);
                        setShowDueQuickEdit(false);
                      }}
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
                      +2 BD
                    </button>

                    {/* Fri (end of week anchor) */}
                    <button
                      onClick={() => {
                        handleQuickDate(actions.nextFriday);
                        setShowDueQuickEdit(false);
                      }}
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
                      {settings.eowAnchor}
                    </button>

                    {/* Calendar icon */}
                    <button
                      onClick={() => setShowDatePicker(!showDatePicker)}
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
                      📅
                    </button>
                  </>
                );
              })()}
            </div>

            {/* Inline date picker */}
            {showDatePicker && (
              <div style={{ marginTop: "0.75rem" }}>
                <input
                  type="date"
                  onChange={(e) => {
                    handleDatePickerChange(e);
                    setShowDueQuickEdit(false);
                  }}
                  defaultValue={result.due_at ? result.due_at.split('T')[0] : ''}
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
                />
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
          {/* Importance bar - clickable for inline editing */}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "0.85rem", marginBottom: "0.25rem", color: "var(--muted)" }}>
              <strong>Importance:</strong> {result.importance}/100
            </div>
            {!isEditingImportance && (id || onChange) ? (
              <div
                onClick={() => setIsEditingImportance(true)}
                style={{
                  height: "6px",
                  backgroundColor: "var(--panel)",
                  borderRadius: "3px",
                  overflow: "hidden",
                  border: "1px solid var(--border)",
                  cursor: "pointer",
                }}
                title="Click to edit importance"
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
            ) : (id || onChange) ? (
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={result.importance}
                onChange={(e) => handleQuickImportance(Number(e.target.value))}
                onBlur={() => setIsEditingImportance(false)}
                autoFocus
                style={{
                  width: "100%",
                  cursor: "pointer",
                  accentColor: "var(--accent)",
                }}
              />
            ) : (
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
            )}
          </div>

          {/* Energy - clickable for inline editing */}
          <div data-energy-edit style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.25rem" }}>
            <span style={{ fontSize: "0.7rem", color: "var(--muted)", fontWeight: "500" }}>Difficulty</span>
            {!isEditingEnergy && (id || onChange) ? (
              <span
                onClick={() => setIsEditingEnergy(true)}
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
                  cursor: "pointer",
                }}
                title="Click to edit difficulty level"
              >
                {result.energy === "med" ? "Medium" : result.energy}
              </span>
            ) : (id || onChange) ? (
              <div style={{ display: "flex", gap: "0.25rem" }}>
                {(["low", "med", "high"] as const).map((level) => (
                  <button
                    key={level}
                    onClick={() => {
                      handleQuickEnergy(level);
                      setIsEditingEnergy(false);
                    }}
                    style={{
                      padding: "0.35rem 0.5rem",
                      backgroundColor:
                        result.energy === level
                          ? level === "high"
                            ? "var(--danger)"
                            : level === "med"
                            ? "var(--warn)"
                            : "var(--accent)"
                          : "var(--panel-2)",
                      color:
                        result.energy === level
                          ? "white"
                          : "var(--text)",
                      border: "1px solid var(--border)",
                      borderRadius: "4px",
                      fontSize: "0.7rem",
                      fontWeight: "600",
                      textTransform: "uppercase",
                      cursor: "pointer",
                    }}
                  >
                    {level === "med" ? "Medium" : level}
                  </button>
                ))}
              </div>
            ) : (
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
                {result.energy === "med" ? "Medium" : result.energy}
              </span>
            )}
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

          {/* Move with dropdown menu */}
          <div style={{ position: "relative" }} data-move-menu>
            <button
              type="button"
              onClick={() => id ? setShowMoveMenu(!showMoveMenu) : (onMove ? onMove() : {})}
              disabled={!id && !onMove}
              style={{
                borderRadius: "6px",
                border: "1px solid var(--border)",
                backgroundColor: "var(--background)",
                padding: "0.25rem 0.75rem",
                color: "var(--text)",
                cursor: (id || onMove) ? "pointer" : "not-allowed",
                opacity: (id || onMove) ? 1 : 0.5,
              }}
              onMouseEnter={(e) => {
                if (id || onMove) {
                  e.currentTarget.style.backgroundColor = "var(--muted)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "var(--background)";
              }}
            >
              Move ▾
            </button>

            {/* Move menu dropdown */}
            {showMoveMenu && id && (
              <div
                style={{
                  position: "absolute",
                  bottom: "100%",
                  left: 0,
                  marginBottom: "0.25rem",
                  backgroundColor: "var(--panel)",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
                  zIndex: 10,
                  minWidth: "150px",
                }}
              >
                {["inbox", "now", "next", "later", "backlog"].map((dest) => (
                  <button
                    key={dest}
                    type="button"
                    onClick={() => handleMoveTo(dest as "inbox" | "now" | "next" | "later" | "backlog")}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "0.5rem 0.75rem",
                      backgroundColor: "transparent",
                      border: "none",
                      color: "var(--text)",
                      cursor: "pointer",
                      fontSize: "0.875rem",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "var(--muted)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }}
                  >
                    {dest.charAt(0).toUpperCase() + dest.slice(1)}
                  </button>
                ))}
              </div>
            )}
          </div>

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

      {/* Notes */}
      <div style={{ marginBottom: "1rem" }}>
        <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "600" }}>
          Notes (optional)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onKeyDown={(e) => handleKeyDown(e, false)} // Don't submit on Enter in textarea
          style={{ ...inputStyle, minHeight: "80px", resize: "vertical" }}
          placeholder="Additional notes or context for this task..."
        />
        {fieldErrors.notes_append && (
          <div style={errorStyle}>
            {fieldErrors.notes_append.map((err, idx) => (
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
