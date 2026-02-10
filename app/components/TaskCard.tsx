"use client";

import { useState, useEffect, useRef, KeyboardEvent } from "react";
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
  status?: "active" | "done" | "follow-up"; // Task status for done toggle
  originalPrompt?: string; // Raw input before AI cleanup
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
  originalPrompt,
  onToggleDone,
  onMove,
  onEdit,
  onDelete,
  onChange,
  selectable = false,
  isSelected = false,
  onToggleSelect,
}: TaskCardProps) {
  // Local task state - this is what the UI renders from
  const [localTask, setLocalTask] = useState(result);

  // Sync local state when result prop changes
  useEffect(() => {
    setLocalTask(result);
  }, [result]);

  // Helper to apply patches to both local state and persistence
  const applyPatch = (patch: Partial<CleanTaskResponse>) => {
    // Update local state immediately for instant UI feedback
    setLocalTask(prev => ({ ...prev, ...patch }));

    // Persist to localStorage if we have an ID
    if (id) {
      updateInboxItemResult(id, patch);
    }

    // Notify parent component
    if (onChange) {
      onChange(patch);
    }
  };

  const [showDetails, setShowDetails] = useState(false);
  const [showJson, setShowJson] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerKey, setDatePickerKey] = useState(0);
  const [isPendingDone, setIsPendingDone] = useState(false);
  const [showAddNotesModal, setShowAddNotesModal] = useState(false);
  const [newNoteText, setNewNoteText] = useState("");
  const [isSavingNote, setIsSavingNote] = useState(false);

  // Inline editing states
  const [isEditingImportance, setIsEditingImportance] = useState(false);
  const [isEditingDuration, setIsEditingDuration] = useState(false);
  const [isEditingEnergy, setIsEditingEnergy] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingProject, setIsEditingProject] = useState(false);
  const [isEditingPlannedDay, setIsEditingPlannedDay] = useState(false);
  const [showDueQuickEdit, setShowDueQuickEdit] = useState(false);

  // Draft values for inline editing
  const [draftTitle, setDraftTitle] = useState(localTask.title);
  const [draftProject, setDraftProject] = useState(localTask.project || "");

  // Edit form state
  const [title, setTitle] = useState(localTask.title);
  const [project, setProject] = useState(localTask.project || "");
  const [tagsText, setTagsText] = useState((localTask.tags || []).join(", "));
  const [subtasksText, setSubtasksText] = useState((localTask.subtasks || []).join("\n"));
  const [notes, setNotes] = useState(localTask.notes_append || "");
  const [effortMin, setEffortMin] = useState<number>(localTask.effort_min || 15);
  const [energy, setEnergy] = useState(localTask.energy || "med");
  const [plannedDay, setPlannedDay] = useState<"mon" | "tue" | "wed" | "thu" | "fri" | "weekend" | null>(localTask.planned_day || null);
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

  // Handle pending done - confirm on click outside, with animation delay
  useEffect(() => {
    if (!isPendingDone) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Check if click is on the undo button
      if (target.closest('[data-undo-button]')) {
        return;
      }
      // Click outside confirms the done action
      setIsPendingDone(false);
      if (onToggleDone) {
        onToggleDone();
      }
    };

    // Small delay to prevent immediate triggering
    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 50);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [isPendingDone, onToggleDone]);

  // Initialize date/time from due_at
  useEffect(() => {
    const { date, time } = splitIso(localTask.due_at);
    setDueDate(date);
    setDueTime(time);
  }, [localTask.due_at]);

  // Sync draft title when localTask changes
  useEffect(() => {
    if (!isEditingTitle) {
      setDraftTitle(localTask.title);
    }
  }, [localTask.title, isEditingTitle]);

  // Sync draft project when localTask changes
  useEffect(() => {
    if (!isEditingProject) {
      setDraftProject(localTask.project || "");
    }
  }, [localTask.project, isEditingProject]);

  // Reset form when entering edit mode
  const handleEdit = () => {
    setTitle(localTask.title);
    setProject(localTask.project || "");
    setTagsText((localTask.tags || []).join(", "));
    setSubtasksText((localTask.subtasks || []).join("\n"));
    setNotes(localTask.notes_append || "");
    setEffortMin(localTask.effort_min || 15);
    setEnergy(localTask.energy || "med");
    setPlannedDay(localTask.planned_day || null);
    const { date, time } = splitIso(localTask.due_at);
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
        planned_day: plannedDay,
        due_at: toIsoFromDateTime(dueDate, dueTime, settings.timezone),
      };

      // Validate against task schema (build a minimal task object for validation)
      const taskToValidate = {
        id: id || "temp",
        title: draft.title,
        status: "active" as const,
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

      // Update local state immediately so the view reflects saved changes
      setLocalTask(prev => ({ ...prev, ...draft } as CleanTaskResponse));

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
    if (!id && !onChange) return;

    try {
      const newDueAt = action();
      applyPatch({ due_at: newDueAt });
      console.log("Updated due date:", newDueAt);
    } catch (error) {
      console.error("Error updating due date:", error);
    }
  };

  // Handle quick importance update
  const handleQuickImportance = (value: number) => {
    if (!id && !onChange) return;

    try {
      applyPatch({ importance: value });
      console.log("Updated importance:", value);
    } catch (error) {
      console.error("Error updating importance:", error);
    }
  };

  // Handle quick effort update
  const handleQuickEffort = (value: number) => {
    if (!id && !onChange) return;

    try {
      applyPatch({ effort_min: value as 5 | 15 | 30 | 60 | 90 | 120 });
      console.log("Updated effort:", value);
    } catch (error) {
      console.error("Error updating effort:", error);
    }
  };

  // Handle quick energy update
  const handleQuickEnergy = (value: "low" | "med" | "high") => {
    if (!id && !onChange) return;

    try {
      applyPatch({ energy: value });
      console.log("Updated energy:", value);
    } catch (error) {
      console.error("Error updating energy:", error);
    }
  };

  // Handle inline title save
  const handleTitleSave = () => {
    if (!id && !onChange) return;

    const trimmedTitle = draftTitle.trim();
    if (!trimmedTitle) {
      // Revert to original if empty
      setDraftTitle(localTask.title);
      setIsEditingTitle(false);
      return;
    }

    try {
      applyPatch({ title: trimmedTitle });
      setIsEditingTitle(false);
      console.log("Updated title:", trimmedTitle);
    } catch (error) {
      console.error("Error updating title:", error);
      setDraftTitle(localTask.title);
      setIsEditingTitle(false);
    }
  };

  // Handle inline project save
  const handleProjectSave = () => {
    if (!id && !onChange) return;

    try {
      const trimmedProject = draftProject.trim();
      applyPatch({ project: trimmedProject || null });
      setIsEditingProject(false);
      console.log("Updated project:", trimmedProject || null);
    } catch (error) {
      console.error("Error updating project:", error);
      setDraftProject(localTask.project || "");
      setIsEditingProject(false);
    }
  };

  // Handle planned day update
  const handlePlannedDayUpdate = (value: "mon" | "tue" | "wed" | "thu" | "fri" | "weekend" | null) => {
    if (!id && !onChange) return;

    try {
      applyPatch({ planned_day: value });
      setIsEditingPlannedDay(false);
      console.log("Updated planned_day:", value);
    } catch (error) {
      console.error("Error updating planned_day:", error);
      setIsEditingPlannedDay(false);
    }
  };

  // Handle Add Notes
  const handleAddNotes = async () => {
    if (!newNoteText.trim()) {
      alert("Please enter a note");
      return;
    }

    if (isSavingNote) return;

    setIsSavingNote(true);

    try {
      // Build task summary for AI using current localTask state
      const taskSummary = {
        id: id || "temp",
        title: localTask.title,
        project: localTask.project,
        tags: localTask.tags,
        notes: localTask.notes_append,
        importance: localTask.importance,
        effort_min: localTask.effort_min,
        energy: localTask.energy,
        planned_day: localTask.planned_day,
        due_at: localTask.due_at,
      };

      // Call AI endpoint
      const response = await fetch("/api/ai/add_notes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-No-Train": "true",
        },
        body: JSON.stringify({
          task: taskSummary,
          new_note_raw: newNoteText,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Add notes API error:", errorData);
        const errorMsg = errorData.error || "Failed to add note";
        const details = errorData.details ? `\n\nDetails: ${JSON.stringify(errorData.details, null, 2)}` : "";
        throw new Error(errorMsg + details);
      }

      const data = await response.json();
      const { notes_append, tags_to_add } = data;

      console.log("✅ AI response received:", { notes_append, tags_to_add });

      // Update task with new notes and tags using localTask
      const currentNotes = localTask.notes_append || "";
      const updatedNotes = currentNotes ? `${currentNotes}\n\n${notes_append}` : notes_append;

      const currentTags = localTask.tags || [];
      const updatedTags = Array.from(new Set([...currentTags, ...tags_to_add]));

      console.log("📝 Applying patch via applyPatch helper:", {
        taskId: id,
        currentNotes: currentNotes.substring(0, 50) + (currentNotes.length > 50 ? "..." : ""),
        updatedNotes: updatedNotes.substring(0, 50) + (updatedNotes.length > 50 ? "..." : ""),
        newTags: tags_to_add,
      });

      // Use applyPatch to update local state and persistence atomically
      applyPatch({
        notes_append: updatedNotes,
        tags: updatedTags,
      });

      // Close modal and reset
      setShowAddNotesModal(false);
      setNewNoteText("");
      console.log("✨ Successfully added note and tags via applyPatch");
    } catch (error) {
      console.error("Error adding note:", error);
      alert(`Failed to add note: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsSavingNote(false);
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
      applyPatch({ due_at: newDueAt });
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

      applyPatch({ due_at: newDueAt });
      setShowDatePicker(false);
      console.log("Updated due date:", newDueAt);
    } catch (error) {
      console.error("Error updating due date:", error);
    }
  };

  // Handle move to specific bucket/status
  const handleMoveTo = (destination: "follow-up" | "now" | "next" | "later" | "backlog") => {
    if (!id) return;

    try {
      // Update status based on destination
      if (destination === "follow-up") {
        updateInboxItemStatus(id, "follow-up");
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

  // Render view mode or edit mode
  return (
    <>
      {!isEditMode ? (
        // View mode
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: "8px",
            padding: "1rem",
            backgroundColor: isPendingDone ? "var(--panel)" : "var(--panel-2)",
            color: "var(--text)",
            display: "flex",
            gap: "0.75rem",
            transition: "all 0.3s ease",
            opacity: isPendingDone ? 0.7 : 1,
            transform: isPendingDone ? "scale(0.98)" : "scale(1)",
          }}
        >
        {/* Pending done overlay with undo button */}
        {isPendingDone ? (
          <div
            style={{
              width: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "2rem",
              gap: "1rem",
            }}
          >
            <div style={{ fontSize: "1.5rem" }}>✓</div>
            <div style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
              Task marked as done
            </div>
            <button
              data-undo-button
              onClick={(e) => {
                e.stopPropagation();
                setIsPendingDone(false);
              }}
              style={{
                padding: "0.5rem 1.5rem",
                backgroundColor: "var(--accent)",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "0.9rem",
                fontWeight: "500",
                transition: "background-color 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--accent-2)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "var(--accent)";
              }}
            >
              Undo
            </button>
            <div style={{ color: "var(--muted)", fontSize: "0.75rem" }}>
              Click anywhere else to confirm
            </div>
          </div>
        ) : (
        <>
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
              aria-label={`Select ${localTask.title}`}
            />
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
        {/* Title - inline editable */}
        {!isEditingTitle && (id || onChange) ? (
          <h3
            onClick={() => {
              setDraftTitle(localTask.title);
              setIsEditingTitle(true);
            }}
            style={{
              margin: "0 0 0.75rem 0",
              fontSize: "1.1rem",
              fontWeight: "600",
              color: "var(--text)",
              cursor: "pointer",
              borderBottom: "2px dashed transparent",
              transition: "border-bottom-color 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderBottomColor = "var(--border)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderBottomColor = "transparent";
            }}
            title="Click to edit title"
          >
            {localTask.title}
          </h3>
        ) : isEditingTitle && (id || onChange) ? (
          <input
            type="text"
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            onBlur={handleTitleSave}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleTitleSave();
              } else if (e.key === "Escape") {
                setDraftTitle(localTask.title);
                setIsEditingTitle(false);
              }
            }}
            autoFocus
            style={{
              margin: "0 0 0.75rem 0",
              fontSize: "1.1rem",
              fontWeight: "600",
              color: "var(--text)",
              backgroundColor: "var(--panel)",
              border: "2px solid var(--accent)",
              borderRadius: "4px",
              padding: "0.25rem 0.5rem",
              width: "100%",
              fontFamily: "inherit",
            }}
          />
        ) : (
          <h3 style={{ margin: "0 0 0.75rem 0", fontSize: "1.1rem", fontWeight: "600", color: "var(--text)" }}>
            {localTask.title}
          </h3>
        )}

        {/* Project + Planned Day row */}
        {!isEditingProject && !isEditingPlannedDay && (id || onChange) ? (
          <div style={{ marginBottom: "0.75rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
            {/* Project on the left */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              {localTask.project ? (
                <span
                  onClick={() => {
                    setDraftProject(localTask.project || "");
                    setIsEditingProject(true);
                  }}
                  style={{
                    display: "inline-block",
                    padding: "0.25rem 0.75rem",
                    backgroundColor: "color-mix(in srgb, var(--accent-2) 20%, transparent)",
                    color: "var(--accent-2)",
                    borderRadius: "12px",
                    fontSize: "0.85rem",
                    border: "1px solid var(--border)",
                    fontWeight: "500",
                    cursor: "pointer",
                  }}
                  title="Click to edit project"
                >
                  {localTask.project}
                </span>
              ) : (
                <button
                  onClick={() => {
                    setDraftProject("");
                    setIsEditingProject(true);
                  }}
                  style={{
                    padding: "0.25rem 0.75rem",
                    backgroundColor: "var(--panel)",
                    color: "var(--muted)",
                    border: "1px dashed var(--border)",
                    borderRadius: "12px",
                    fontSize: "0.85rem",
                    cursor: "pointer",
                    fontWeight: "500",
                  }}
                  title="Click to add project"
                >
                  + Add project
                </button>
              )}
            </div>

            {/* Planned Day on the right */}
            <div>
              <span
                onClick={() => setIsEditingPlannedDay(true)}
                style={{
                  display: "inline-block",
                  padding: "0.25rem 0.5rem",
                  backgroundColor: localTask.planned_day
                    ? "color-mix(in srgb, var(--accent) 20%, transparent)"
                    : "var(--panel)",
                  color: localTask.planned_day ? "var(--accent)" : "var(--muted)",
                  borderRadius: "8px",
                  fontSize: "0.75rem",
                  border: localTask.planned_day ? "1px solid var(--border)" : "1px dashed var(--border)",
                  fontWeight: "600",
                  cursor: "pointer",
                  textTransform: "capitalize",
                }}
                title="Click to edit planned day"
              >
                {localTask.planned_day === "mon" ? "Mon"
                  : localTask.planned_day === "tue" ? "Tue"
                  : localTask.planned_day === "wed" ? "Wed"
                  : localTask.planned_day === "thu" ? "Thu"
                  : localTask.planned_day === "fri" ? "Fri"
                  : localTask.planned_day === "weekend" ? "Weekend"
                  : "None"}
              </span>
            </div>
          </div>
        ) : isEditingProject && (id || onChange) ? (
          <div style={{ marginBottom: "0.75rem" }}>
            <input
              type="text"
              value={draftProject}
              onChange={(e) => setDraftProject(e.target.value)}
              onBlur={handleProjectSave}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleProjectSave();
                } else if (e.key === "Escape") {
                  setDraftProject(localTask.project || "");
                  setIsEditingProject(false);
                }
              }}
              autoFocus
              placeholder="Enter project name"
              style={{
                fontSize: "0.85rem",
                fontWeight: "500",
                color: "var(--text)",
                backgroundColor: "var(--panel)",
                border: "2px solid var(--accent)",
                borderRadius: "12px",
                padding: "0.25rem 0.75rem",
                width: "auto",
                minWidth: "200px",
                fontFamily: "inherit",
              }}
            />
          </div>
        ) : isEditingPlannedDay && (id || onChange) ? (
          <div style={{ marginBottom: "0.75rem" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
              {[null, "mon", "tue", "wed", "thu", "fri", "weekend"].map((day) => (
                <button
                  key={day || "none"}
                  onClick={() => handlePlannedDayUpdate(day as "mon" | "tue" | "wed" | "thu" | "fri" | "weekend" | null)}
                  style={{
                    padding: "0.25rem 0.5rem",
                    backgroundColor: localTask.planned_day === day
                      ? "var(--accent)"
                      : "var(--panel-2)",
                    color: localTask.planned_day === day
                      ? "white"
                      : "var(--text)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    fontSize: "0.75rem",
                    fontWeight: "600",
                    cursor: "pointer",
                    textTransform: "capitalize",
                  }}
                >
                  {day === null ? "None"
                    : day === "mon" ? "Mon"
                    : day === "tue" ? "Tue"
                    : day === "wed" ? "Wed"
                    : day === "thu" ? "Thu"
                    : day === "fri" ? "Fri"
                    : "Weekend"}
                </button>
              ))}
            </div>
          </div>
        ) : localTask.project ? (
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
              {localTask.project}
            </span>
          </div>
        ) : null}

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
                <DateText value={localTask.due_at} tz={settings.timezone} variant="short" />
              </span>
            ) : (
              <DateText value={localTask.due_at} tz={settings.timezone} variant="short" />
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
                {formatDuration(localTask.effort_min)}
              </span>
            ) : (id || onChange) ? (
              <select
                value={localTask.effort_min}
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
              <span>{formatDuration(localTask.effort_min)}</span>
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
                const actions = getQuickDateActions(settings, localTask.due_at);
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

                    {/* Calendar icon with inline date picker */}
                    <span style={{ position: "relative", display: "inline-block" }}>
                      <button
                        onClick={() => {
                          if (showDatePicker) {
                            setShowDatePicker(false);
                          } else {
                            setDatePickerKey(k => k + 1);
                            setShowDatePicker(true);
                          }
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
                        📅
                      </button>
                      {showDatePicker && (
                        <input
                          key={datePickerKey}
                          type="date"
                          ref={(el) => {
                            // Auto-open the calendar picker when the input mounts
                            if (el) {
                              // Small delay to ensure the element is fully rendered
                              setTimeout(() => {
                                try {
                                  el.showPicker();
                                } catch {
                                  // Fallback for browsers that don't support showPicker
                                  el.focus();
                                  el.click();
                                }
                              }, 0);
                            }
                          }}
                          onChange={(e) => {
                            handleDatePickerChange(e);
                            setShowDatePicker(false);
                            setShowDueQuickEdit(false);
                          }}
                          onBlur={() => setShowDatePicker(false)}
                          defaultValue={localTask.due_at ? localTask.due_at.split('T')[0] : ''}
                          style={{
                            position: "absolute",
                            top: 0,
                            left: "100%",
                            marginLeft: "4px",
                            opacity: 0,
                            width: "1px",
                            height: "100%",
                            border: "none",
                            padding: 0,
                          }}
                        />
                      )}
                    </span>
                  </>
                );
              })()}
            </div>

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
              <strong>Importance:</strong> {localTask.importance}/100
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
                    width: `${localTask.importance}%`,
                    backgroundColor:
                      localTask.importance > 75
                        ? "var(--danger)"
                        : localTask.importance > 50
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
                value={localTask.importance}
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
                    width: `${localTask.importance}%`,
                    backgroundColor:
                      localTask.importance > 75
                        ? "var(--danger)"
                        : localTask.importance > 50
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
                    localTask.energy === "high"
                      ? "color-mix(in srgb, var(--danger) 20%, transparent)"
                      : localTask.energy === "med"
                      ? "color-mix(in srgb, var(--warn) 20%, transparent)"
                      : "color-mix(in srgb, var(--accent) 20%, transparent)",
                  color:
                    localTask.energy === "high"
                      ? "var(--danger)"
                      : localTask.energy === "med"
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
                {localTask.energy === "med" ? "Medium" : localTask.energy}
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
                        localTask.energy === level
                          ? level === "high"
                            ? "var(--danger)"
                            : level === "med"
                            ? "var(--warn)"
                            : "var(--accent)"
                          : "var(--panel-2)",
                      color:
                        localTask.energy === level
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
                    localTask.energy === "high"
                      ? "color-mix(in srgb, var(--danger) 20%, transparent)"
                      : localTask.energy === "med"
                      ? "color-mix(in srgb, var(--warn) 20%, transparent)"
                      : "color-mix(in srgb, var(--accent) 20%, transparent)",
                  color:
                    localTask.energy === "high"
                      ? "var(--danger)"
                      : localTask.energy === "med"
                      ? "var(--warn)"
                      : "var(--accent)",
                  borderRadius: "12px",
                  fontSize: "0.75rem",
                  border: "1px solid var(--border)",
                  fontWeight: "600",
                  textTransform: "uppercase",
                }}
              >
                {localTask.energy === "med" ? "Medium" : localTask.energy}
              </span>
            )}
          </div>
        </div>

        {/* Collapsible More info section */}
        {((localTask.tags && localTask.tags.length > 0) ||
          (localTask.subtasks && localTask.subtasks.length > 0) ||
          localTask.notes_append) && (
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
                {localTask.tags && localTask.tags.length > 0 && (
                  <div style={{ marginBottom: localTask.subtasks || localTask.notes_append ? "0.75rem" : "0" }}>
                    <strong style={{ fontSize: "0.85rem", color: "var(--muted)", display: "block", marginBottom: "0.5rem" }}>
                      Tags
                    </strong>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                      {localTask.tags.map((tag, idx) => (
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
                {localTask.subtasks && localTask.subtasks.length > 0 && (
                  <div style={{ marginBottom: localTask.notes_append ? "0.75rem" : "0" }}>
                    <strong style={{ fontSize: "0.85rem", color: "var(--muted)", display: "block", marginBottom: "0.5rem" }}>
                      Subtasks
                    </strong>
                    <ul style={{ margin: 0, padding: "0 0 0 1.25rem", fontSize: "0.85rem" }}>
                      {localTask.subtasks.map((subtask, idx) => (
                        <li key={idx} style={{ marginBottom: "0.25rem" }}>{subtask}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Notes */}
                {localTask.notes_append && (
                  <div style={{ marginBottom: "0.75rem" }}>
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
                      {localTask.notes_append}
                    </div>
                  </div>
                )}

                {/* JSON Debug Toggle */}
                <div style={{ marginTop: "0.5rem", display: "flex", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    onClick={() => setShowJson(!showJson)}
                    style={{
                      fontSize: "0.7rem",
                      color: "var(--muted)",
                      textDecoration: "underline",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: "0.25rem",
                    }}
                  >
                    {showJson ? "Hide JSON" : "Show JSON"}
                  </button>
                </div>

                {/* JSON Debug View */}
                {showJson && (
                  <pre
                    style={{
                      marginTop: "0.5rem",
                      borderRadius: "4px",
                      backgroundColor: "var(--panel-2)",
                      padding: "0.5rem",
                      fontSize: "10px",
                      lineHeight: "1.3",
                      overflowX: "auto",
                      whiteSpace: "pre",
                      border: "1px solid var(--border)",
                      maxHeight: "300px",
                      overflowY: "auto",
                    }}
                  >
                    {JSON.stringify(localTask, null, 2)}
                  </pre>
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
            onClick={() => {
              if (!onToggleDone) return;
              // If marking as done (not already done), show undo option
              if (status !== "done") {
                setIsPendingDone(true);
              } else {
                // Marking as active - no undo needed
                onToggleDone();
              }
            }}
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
                {["follow-up", "now", "next", "later", "backlog"].map((dest) => (
                  <button
                    key={dest}
                    type="button"
                    onClick={() => handleMoveTo(dest as "follow-up" | "now" | "next" | "later" | "backlog")}
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

          {/* Add notes */}
          <button
            type="button"
            onClick={() => setShowAddNotesModal(true)}
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
            Add notes
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
        </>)}
      </div>
      ) : (
        // Edit mode
        <>
        {(() => {
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

      {/* Original prompt - read-only */}
      {originalPrompt && (
        <div style={{ marginBottom: "1rem" }}>
          <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "600", fontSize: "0.85rem", color: "var(--muted)" }}>
            Original prompt
          </label>
          <div
            style={{
              width: "100%",
              backgroundColor: "var(--panel)",
              color: "var(--text)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              padding: "0.75rem",
              fontSize: "0.85rem",
              fontFamily: "inherit",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              opacity: 0.85,
            }}
          >
            {originalPrompt}
          </div>
        </div>
      )}

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
          <option value={90}>90 min</option>
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

      {/* Planned work day */}
      <div style={{ marginBottom: "1rem" }}>
        <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "600" }}>
          Planned work day
        </label>
        <select
          value={plannedDay || ""}
          onChange={(e) => setPlannedDay(e.target.value === "" ? null : e.target.value as "mon" | "tue" | "wed" | "thu" | "fri" | "weekend")}
          onKeyDown={(e) => handleKeyDown(e)}
          style={inputStyle}
        >
          <option value="">None</option>
          <option value="mon">Mon</option>
          <option value="tue">Tue</option>
          <option value="wed">Wed</option>
          <option value="thu">Thu</option>
          <option value="fri">Fri</option>
          <option value="weekend">Weekend</option>
        </select>
        {fieldErrors.planned_day && (
          <div style={errorStyle}>
            {fieldErrors.planned_day.map((err, idx) => (
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
        })()}
        </>
      )}

      {/* Add Notes Modal - always rendered regardless of edit mode */}
      {showAddNotesModal && (
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
          }}
          onClick={() => {
            if (!isSavingNote) {
              setShowAddNotesModal(false);
              setNewNoteText("");
            }
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "var(--panel-2)",
              borderRadius: "8px",
              padding: "1.5rem",
              maxWidth: "600px",
              width: "90%",
              maxHeight: "80vh",
              overflow: "auto",
              border: "1px solid var(--border)",
            }}
          >
            {/* Task title for context */}
            <h3 style={{ margin: "0 0 1rem 0", fontSize: "1.2rem", fontWeight: "600", color: "var(--text)" }}>
              {localTask.title}
            </h3>

            {/* Existing notes (read-only) */}
            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "600", fontSize: "0.9rem" }}>
                Existing notes
              </label>
              {localTask.notes_append ? (
                <div
                  style={{
                    backgroundColor: "var(--panel)",
                    padding: "0.75rem",
                    borderRadius: "6px",
                    border: "1px solid var(--border)",
                    maxHeight: "8rem",
                    overflowY: "auto",
                    fontSize: "0.85rem",
                    color: "var(--text)",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {localTask.notes_append}
                </div>
              ) : (
                <div
                  style={{
                    backgroundColor: "var(--panel)",
                    padding: "0.75rem",
                    borderRadius: "6px",
                    border: "1px dashed var(--border)",
                    fontSize: "0.85rem",
                    color: "var(--muted)",
                    fontStyle: "italic",
                  }}
                >
                  No notes yet for this task.
                </div>
              )}
            </div>

            {/* New note input */}
            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "600", fontSize: "0.9rem" }}>
                New note
              </label>
              <textarea
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
                placeholder="Type your note about this task…"
                autoFocus
                style={{
                  width: "100%",
                  minHeight: "100px",
                  backgroundColor: "var(--background)",
                  color: "var(--text)",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  padding: "0.75rem",
                  fontSize: "0.9rem",
                  fontFamily: "inherit",
                  resize: "vertical",
                }}
              />
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
              <button
                onClick={() => {
                  setShowAddNotesModal(false);
                  setNewNoteText("");
                }}
                disabled={isSavingNote}
                style={{
                  padding: "0.5rem 1rem",
                  backgroundColor: "var(--panel)",
                  color: "var(--text)",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  cursor: isSavingNote ? "not-allowed" : "pointer",
                  fontSize: "0.9rem",
                  opacity: isSavingNote ? 0.5 : 1,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleAddNotes}
                disabled={isSavingNote || !newNoteText.trim()}
                style={{
                  padding: "0.5rem 1rem",
                  backgroundColor: isSavingNote || !newNoteText.trim() ? "var(--muted)" : "var(--accent)",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  cursor: isSavingNote || !newNoteText.trim() ? "not-allowed" : "pointer",
                  fontSize: "0.9rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                {isSavingNote && <span>⏳</span>}
                {isSavingNote ? "Cleaning…" : "Save with AI"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
