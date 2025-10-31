"use client";

import { useState, useEffect } from "react";
import type { WorkSettings, DayOfWeek, TidySettingsDoc } from "@/src/types";
import {
  getDefaultWorkSettings,
  getStoredSettings,
  saveSettings,
  resetSettings,
} from "@/src/lib/settings";

const ALL_DAYS: DayOfWeek[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function SettingsPage() {
  const [work, setWork] = useState<WorkSettings>(getDefaultWorkSettings());
  const [projectsJson, setProjectsJson] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // Load settings on mount
  useEffect(() => {
    setMounted(true);
    const stored = getStoredSettings();
    if (stored?.work) {
      setWork(stored.work);
      if (stored.work.projects && stored.work.projects.length > 0) {
        setProjectsJson(JSON.stringify(stored.work.projects, null, 2));
      }
    }
  }, []);

  const handleSave = () => {
    setError(null);

    // Validate projects JSON if provided
    let projects = work.projects || [];
    if (projectsJson.trim()) {
      try {
        projects = JSON.parse(projectsJson);
        if (!Array.isArray(projects)) {
          setError("Projects must be a JSON array");
          return;
        }
      } catch (e) {
        setError("Invalid JSON in projects field");
        return;
      }
    }

    const doc: TidySettingsDoc = {
      version: 1,
      work: {
        ...work,
        projects,
      },
    };

    saveSettings(doc);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    if (confirm("Reset all settings to defaults?")) {
      resetSettings();
      const defaults = getDefaultWorkSettings();
      setWork(defaults);
      setProjectsJson("");
      setSaved(false);
      setError(null);
    }
  };

  const toggleWorkDay = (day: DayOfWeek) => {
    const current = work.workDays || [];
    if (current.includes(day)) {
      setWork({ ...work, workDays: current.filter((d) => d !== day) });
    } else {
      setWork({ ...work, workDays: [...current, day] });
    }
  };

  if (!mounted) {
    return (
      <div style={{ padding: "2rem" }}>
        <div style={{ maxWidth: "800px", margin: "0 auto" }}>
          <h1>Settings</h1>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "2rem" }}>
      <div style={{ maxWidth: "800px", margin: "0 auto" }}>
        <h1 style={{ marginBottom: "1rem" }}>Work Context Settings</h1>
        <p style={{ color: "#666", marginBottom: "2rem" }}>
          Configure your work schedule and timezone for smarter task parsing.
        </p>

        <div
          style={{
            backgroundColor: "#fff",
            border: "1px solid #ddd",
            borderRadius: "8px",
            padding: "2rem",
            color: "#111",
          }}
        >
          {/* Timezone */}
          <div style={{ marginBottom: "1.5rem" }}>
            <label htmlFor="timezone" style={{ display: "block", fontWeight: "500", marginBottom: "0.5rem" }}>
              Timezone (IANA)
            </label>
            <input
              id="timezone"
              type="text"
              value={work.timezone}
              onChange={(e) => setWork({ ...work, timezone: e.target.value })}
              placeholder="America/Phoenix"
              style={{
                width: "100%",
                padding: "0.5rem",
                borderRadius: "4px",
                border: "1px solid #ccc",
                fontSize: "1rem",
              }}
            />
            <div style={{ fontSize: "0.85rem", color: "#666", marginTop: "0.25rem" }}>
              Examples: America/Phoenix, America/Chicago, America/New_York
            </div>
          </div>

          {/* Work Days */}
          <div style={{ marginBottom: "1.5rem" }}>
            <label style={{ display: "block", fontWeight: "500", marginBottom: "0.5rem" }}>Work Days</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
              {ALL_DAYS.map((day) => (
                <label
                  key={day}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.25rem",
                    padding: "0.5rem",
                    border: "1px solid #ddd",
                    borderRadius: "4px",
                    cursor: "pointer",
                    backgroundColor: work.workDays.includes(day) ? "#e3f2fd" : "#fff",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={work.workDays.includes(day)}
                    onChange={() => toggleWorkDay(day)}
                  />
                  {day}
                </label>
              ))}
            </div>
          </div>

          {/* End of Day */}
          <div style={{ marginBottom: "1.5rem" }}>
            <label htmlFor="endOfDay" style={{ display: "block", fontWeight: "500", marginBottom: "0.5rem" }}>
              End of Day (HH:MM)
            </label>
            <input
              id="endOfDay"
              type="time"
              value={work.endOfDay}
              onChange={(e) => setWork({ ...work, endOfDay: e.target.value })}
              style={{
                padding: "0.5rem",
                borderRadius: "4px",
                border: "1px solid #ccc",
                fontSize: "1rem",
              }}
            />
            <div style={{ fontSize: "0.85rem", color: "#666", marginTop: "0.25rem" }}>
              Default deadline time when "end of day" is mentioned
            </div>
          </div>

          {/* End of Week Anchor */}
          <div style={{ marginBottom: "1.5rem" }}>
            <label htmlFor="eowAnchor" style={{ display: "block", fontWeight: "500", marginBottom: "0.5rem" }}>
              End of Week Anchor Day
            </label>
            <select
              id="eowAnchor"
              value={work.eowAnchor}
              onChange={(e) => setWork({ ...work, eowAnchor: e.target.value as DayOfWeek })}
              style={{
                padding: "0.5rem",
                borderRadius: "4px",
                border: "1px solid #ccc",
                fontSize: "1rem",
              }}
            >
              {ALL_DAYS.map((day) => (
                <option key={day} value={day}>
                  {day}
                </option>
              ))}
            </select>
            <div style={{ fontSize: "0.85rem", color: "#666", marginTop: "0.25rem" }}>
              When "end of week" is mentioned, use this day
            </div>
          </div>

          {/* Rollover Rule */}
          <div style={{ marginBottom: "1.5rem" }}>
            <label htmlFor="eowRollover" style={{ display: "block", fontWeight: "500", marginBottom: "0.5rem" }}>
              End of Week Rollover
            </label>
            <select
              id="eowRollover"
              value={work.eowRollover}
              onChange={(e) => setWork({ ...work, eowRollover: e.target.value as any })}
              style={{
                padding: "0.5rem",
                borderRadius: "4px",
                border: "1px solid #ccc",
                fontSize: "1rem",
                width: "100%",
              }}
            >
              <option value="same-week">Same week (even if past EOD)</option>
              <option value="next-workweek-if-past-eod">Next workweek if past EOD</option>
            </select>
            <div style={{ fontSize: "0.85rem", color: "#666", marginTop: "0.25rem" }}>
              If it's Friday 6 PM and anchor is Friday, should "EOW" mean today or next Friday?
            </div>
          </div>

          {/* Projects (Optional) */}
          <div style={{ marginBottom: "1.5rem" }}>
            <label htmlFor="projects" style={{ display: "block", fontWeight: "500", marginBottom: "0.5rem" }}>
              Project Context (Optional JSON)
            </label>
            <textarea
              id="projects"
              value={projectsJson}
              onChange={(e) => setProjectsJson(e.target.value)}
              placeholder='[{"name": "Shawnee-Walker", "priority": 1}]'
              rows={5}
              style={{
                width: "100%",
                padding: "0.5rem",
                borderRadius: "4px",
                border: "1px solid #ccc",
                fontSize: "0.9rem",
                fontFamily: "monospace",
                resize: "vertical",
              }}
            />
            <div style={{ fontSize: "0.85rem", color: "#666", marginTop: "0.25rem" }}>
              Optional: Provide project context for AI (must be valid JSON array)
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div
              style={{
                padding: "0.75rem",
                backgroundColor: "#ffebee",
                color: "#c62828",
                borderRadius: "4px",
                marginBottom: "1rem",
                fontSize: "0.9rem",
              }}
            >
              {error}
            </div>
          )}

          {/* Success Message */}
          {saved && (
            <div
              style={{
                padding: "0.75rem",
                backgroundColor: "#e8f5e9",
                color: "#2e7d32",
                borderRadius: "4px",
                marginBottom: "1rem",
                fontSize: "0.9rem",
              }}
            >
              ✓ Settings saved successfully!
            </div>
          )}

          {/* Buttons */}
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              onClick={handleSave}
              style={{
                padding: "0.75rem 1.5rem",
                backgroundColor: "#1976d2",
                color: "#fff",
                border: "none",
                borderRadius: "4px",
                fontSize: "1rem",
                fontWeight: "500",
                cursor: "pointer",
              }}
            >
              Save Settings
            </button>

            <button
              onClick={handleReset}
              style={{
                padding: "0.75rem 1.5rem",
                backgroundColor: "#fff",
                color: "#666",
                border: "1px solid #ccc",
                borderRadius: "4px",
                fontSize: "1rem",
                cursor: "pointer",
              }}
            >
              Use Defaults
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
