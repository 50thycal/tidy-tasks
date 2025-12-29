"use client";

import { useState, useEffect, useRef } from "react";
import type { WorkSettingsV2, DayOfWeek, TidySettingsDocV2, ProjectMeta, USZoneKey } from "@/src/types";
import {
  getDefaultWorkSettingsV2,
  getStoredSettings,
  saveSettings,
  resetSettings,
} from "@/src/lib/settings";
import ProjectsTable from "@/app/components/Settings/ProjectsTable";
import { exportAndDownloadJson, exportAndDownloadCsv, type BackupDoc } from "@/src/lib/export";
import { validateBackup, importBackup, getBackupPreview, type ImportResult } from "@/src/lib/import";
import { invalidateAndReload } from "@/src/lib/sw-control";

const ALL_DAYS: DayOfWeek[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const US_ZONES: USZoneKey[] = ["Pacific", "Mountain", "Central", "Eastern"];
const US_TZ: Record<USZoneKey, string> = {
  Pacific: 'America/Los_Angeles',
  Mountain: 'America/Denver',
  Central: 'America/Chicago',
  Eastern: 'America/New_York',
};

export default function SettingsPage() {
  const [work, setWork] = useState<WorkSettingsV2>(getDefaultWorkSettingsV2());
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // Import/Export state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importMode, setImportMode] = useState<"append" | "replace">("append");
  const [importFile, setImportFile] = useState<BackupDoc | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Privacy state
  const [privacyEnabled, setPrivacyEnabled] = useState(false);
  const [redactionMode, setRedactionMode] = useState<"none" | "emails_phones" | "emails_phones_names">("emails_phones");

  // Load settings on mount
  useEffect(() => {
    setMounted(true);
    const stored = getStoredSettings();
    if (stored?.work) {
      setWork(stored.work);
      // Load privacy settings
      if (stored.work.privacy) {
        setPrivacyEnabled(stored.work.privacy.enabled);
        setRedactionMode(stored.work.privacy.redactionMode);
      }
    }
  }, []);

  const handleSave = () => {
    setError(null);

    const doc: TidySettingsDocV2 = {
      version: 2,
      work: {
        ...work,
        privacy: {
          enabled: privacyEnabled,
          redactionMode,
        },
      },
    };

    saveSettings(doc);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    if (confirm("Reset all settings to defaults?")) {
      resetSettings();
      const defaults = getDefaultWorkSettingsV2();
      setWork(defaults);
      setSaved(false);
      setError(null);
    }
  };

  const toggleWorkDay = (day: DayOfWeek) => {
    const lowercaseDay = day.toLowerCase() as 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
    const current = work.work_days || [];
    if (current.includes(lowercaseDay)) {
      setWork({ ...work, work_days: current.filter((d) => d !== lowercaseDay) });
    } else {
      setWork({ ...work, work_days: [...current, lowercaseDay] });
    }
  };

  // Export handlers
  const handleExportJson = async () => {
    setExporting(true);
    try {
      await exportAndDownloadJson();
    } catch (err) {
      alert(`Export failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setExporting(false);
    }
  };

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      await exportAndDownloadCsv();
    } catch (err) {
      alert(`Export failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setExporting(false);
    }
  };

  // Import handlers
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportError(null);
    setImportSuccess(null);
    setImportFile(null);

    try {
      const text = await file.text();
      const json = JSON.parse(text);
      validateBackup(json);
      setImportFile(json);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Failed to read or parse file");
    }
  };

  const handleImportConfirm = async () => {
    if (!importFile) return;

    if (importMode === "replace") {
      if (!confirm("⚠️ WARNING: This will REPLACE ALL your data. Are you sure?")) {
        return;
      }
    }

    setImporting(true);
    setImportError(null);
    setImportSuccess(null);

    try {
      const result: ImportResult = await importBackup(importFile, importMode);

      // Build success message
      const messages: string[] = [];
      if (result.added.tasks > 0 || result.skipped > 0) {
        messages.push(`Tasks: ${result.added.tasks} added${result.skipped > 0 ? `, ${result.skipped} skipped` : ""}`);
      }
      if (result.updated.tasks > 0) {
        messages.push(`${result.updated.tasks} tasks updated`);
      }
      if (result.settings) {
        messages.push("Settings restored");
      }
      if (result.metrics) {
        messages.push("Metrics restored");
      }
      if (result.added.summaries > 0 || result.updated.summaries > 0) {
        messages.push(`Summaries: ${result.added.summaries} added, ${result.updated.summaries} updated`);
      }
      if (result.added.layouts > 0 || result.updated.layouts > 0) {
        messages.push(`Focus layouts: ${result.added.layouts} added, ${result.updated.layouts} updated`);
      }

      setImportSuccess(`✓ Import successful! ${messages.join(" · ")}`);
      setImportFile(null);

      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      // Reload settings if they were imported
      if (result.settings) {
        const stored = getStoredSettings();
        if (stored?.work) {
          setWork(stored.work);
        }
      }

      // Auto-hide success message after 5 seconds
      setTimeout(() => setImportSuccess(null), 5000);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const handleInvalidateCache = async () => {
    if (confirm("Clear all cached app data and reload? This will get the newest version.")) {
      await invalidateAndReload();
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
    <div style={{ padding: "2rem", minHeight: "100vh" }}>
      <div style={{ maxWidth: "800px", margin: "0 auto" }}>
        <h1 style={{ marginBottom: "1rem" }}>Work Context Settings</h1>
        <p style={{ color: "var(--muted)", marginBottom: "2rem" }}>
          Configure your work schedule and timezone for smarter task parsing.
        </p>

        <div
          style={{
            backgroundColor: "var(--panel)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            padding: "2rem",
            color: "var(--text)",
          }}
        >
          {/* Timezone */}
          <div style={{ marginBottom: "1.5rem" }}>
            <label htmlFor="timezone" style={{ display: "block", fontWeight: "500", marginBottom: "0.5rem", color: "var(--text)" }}>
              Timezone
            </label>
            <select
              id="timezone"
              value={Object.keys(US_TZ).find(key => US_TZ[key as USZoneKey] === work.timezone) || "Pacific"}
              onChange={(e) => setWork({ ...work, timezone: US_TZ[e.target.value as USZoneKey] })}
              className="input"
            >
              {US_ZONES.map((zone) => (
                <option key={zone} value={zone}>
                  {zone} ({US_TZ[zone]})
                </option>
              ))}
            </select>
            <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: "0.25rem" }}>
              Select your US timezone
            </div>
          </div>

          {/* Work Days */}
          <div style={{ marginBottom: "1.5rem" }}>
            <label style={{ display: "block", fontWeight: "500", marginBottom: "0.5rem", color: "var(--text)" }}>Work Days</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
              {ALL_DAYS.map((day) => {
                const lowercaseDay = day.toLowerCase() as 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
                return (
                  <label
                    key={day}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.25rem",
                      padding: "0.5rem",
                      border: "1px solid var(--border)",
                      borderRadius: "4px",
                      cursor: "pointer",
                      backgroundColor: work.work_days.includes(lowercaseDay) ? "color-mix(in srgb, var(--accent) 15%, transparent)" : "var(--panel-2)",
                      color: "var(--text)",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={work.work_days.includes(lowercaseDay)}
                      onChange={() => toggleWorkDay(day)}
                    />
                    {day}
                  </label>
                );
              })}
            </div>
          </div>

          {/* End of Day */}
          <div style={{ marginBottom: "1.5rem" }}>
            <label htmlFor="end_of_day" style={{ display: "block", fontWeight: "500", marginBottom: "0.5rem", color: "var(--text)" }}>
              End of Day (HH:MM)
            </label>
            <input
              id="end_of_day"
              type="time"
              value={work.end_of_day}
              onChange={(e) => setWork({ ...work, end_of_day: e.target.value })}
              className="input"
            />
            <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: "0.25rem" }}>
              Default deadline time when "end of day" is mentioned
            </div>
          </div>

          {/* End of Week Anchor */}
          <div style={{ marginBottom: "1.5rem" }}>
            <label htmlFor="eow_anchor" style={{ display: "block", fontWeight: "500", marginBottom: "0.5rem", color: "var(--text)" }}>
              End of Week Anchor Day
            </label>
            <select
              id="eow_anchor"
              value={work.eow_anchor}
              onChange={(e) => setWork({ ...work, eow_anchor: e.target.value as DayOfWeek })}
              className="input"
            >
              {ALL_DAYS.map((day) => (
                <option key={day} value={day}>
                  {day}
                </option>
              ))}
            </select>
            <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: "0.25rem" }}>
              When "end of week" is mentioned, use this day
            </div>
          </div>

          {/* Role Section */}
          <div style={{ marginBottom: "1.5rem" }}>
            <label htmlFor="role_title" style={{ display: "block", fontWeight: "500", marginBottom: "0.5rem", color: "var(--text)" }}>
              Job Title (Optional)
            </label>
            <input
              id="role_title"
              type="text"
              value={work.role?.title || ""}
              onChange={(e) => setWork({ ...work, role: { ...work.role, title: e.target.value } })}
              placeholder="e.g., Software Engineer"
              className="input"
            />
            <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: "0.25rem" }}>
              Your job title or role in the organization
            </div>
          </div>

          <div style={{ marginBottom: "1.5rem" }}>
            <label htmlFor="role_context" style={{ display: "block", fontWeight: "500", marginBottom: "0.5rem", color: "var(--text)" }}>
              Role Context (Optional)
            </label>
            <textarea
              id="role_context"
              value={work.role?.context || ""}
              onChange={(e) => setWork({ ...work, role: { ...work.role, context: e.target.value } })}
              placeholder="Describe your role, team, or responsibilities..."
              rows={3}
              className="textarea"
              style={{ resize: "vertical" }}
            />
            <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: "0.25rem" }}>
              Additional context about your role for AI task parsing
            </div>
          </div>

          {/* Projects Table */}
          <div style={{ marginBottom: "1.5rem" }}>
            <label style={{ display: "block", fontWeight: "500", marginBottom: "0.5rem", color: "var(--text)" }}>
              Projects
            </label>
            <ProjectsTable
              value={work.projects || []}
              onChange={(projects) => setWork({ ...work, projects })}
            />
            <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: "0.5rem" }}>
              Track project milestones: LLMR (Last Responsible Moment Review), IFR (Incremental Funding Review), IFC (In-Flight Check-in)
            </div>
          </div>

          {/* Work Context */}
          <div style={{ marginBottom: "1.5rem" }}>
            <label htmlFor="work_context" style={{ display: "block", fontWeight: "500", marginBottom: "0.5rem", color: "var(--text)" }}>
              Work Context (Optional)
            </label>
            <textarea
              id="work_context"
              value={work.work_context || ""}
              onChange={(e) => setWork({ ...work, work_context: e.target.value })}
              placeholder="Additional work context, conventions, or notes..."
              rows={4}
              className="textarea"
              style={{ resize: "vertical" }}
            />
            <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: "0.25rem" }}>
              Freeform notes about your work environment, conventions, or anything else to help AI understand your tasks
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div
              style={{
                padding: "0.75rem",
                backgroundColor: "color-mix(in srgb, var(--danger) 15%, transparent)",
                color: "var(--danger)",
                borderRadius: "4px",
                marginBottom: "1rem",
                fontSize: "0.9rem",
                border: "1px solid var(--border)",
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
                backgroundColor: "color-mix(in srgb, var(--accent-2) 15%, transparent)",
                color: "var(--accent-2)",
                borderRadius: "4px",
                marginBottom: "1rem",
                fontSize: "0.9rem",
                border: "1px solid var(--border)",
              }}
            >
              ✓ Settings saved successfully!
            </div>
          )}

          {/* Buttons */}
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              onClick={handleSave}
              className="btn btn-primary"
              style={{
                padding: "0.75rem 1.5rem",
              }}
            >
              Save Settings
            </button>

            <button
              onClick={handleReset}
              style={{
                padding: "0.75rem 1.5rem",
                backgroundColor: "var(--panel-2)",
                color: "var(--text)",
                border: "1px solid var(--border)",
                borderRadius: "4px",
                fontSize: "1rem",
                cursor: "pointer",
              }}
            >
              Use Defaults
            </button>
          </div>
        </div>

        {/* AI & Privacy */}
        <div
          style={{
            backgroundColor: "var(--panel)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            padding: "2rem",
            color: "var(--text)",
            marginTop: "2rem",
          }}
        >
          <h2 style={{ marginBottom: "1rem", fontSize: "1.25rem" }}>AI & Privacy</h2>
          <p style={{ color: "var(--muted)", marginBottom: "1.5rem", fontSize: "0.9rem" }}>
            Control what data is sent to AI for task processing. When privacy is OFF, your raw task text is sent as-is.
          </p>

          {/* Enable Privacy Toggle */}
          <div style={{ marginBottom: "1.5rem" }}>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                cursor: "pointer",
                padding: "0.75rem",
                borderRadius: "4px",
                backgroundColor: privacyEnabled ? "color-mix(in srgb, var(--accent) 15%, transparent)" : "transparent",
                border: "1px solid var(--border)",
              }}
            >
              <input
                type="checkbox"
                checked={privacyEnabled}
                onChange={(e) => setPrivacyEnabled(e.target.checked)}
                style={{ cursor: "pointer" }}
              />
              <div>
                <div style={{ fontWeight: "500", color: "var(--text)" }}>
                  Redact sensitive info before sending to AI
                </div>
                <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: "0.25rem" }}>
                  {privacyEnabled
                    ? "Privacy mode ON - sensitive data will be redacted"
                    : "Privacy mode OFF - raw task text sent to AI"}
                </div>
              </div>
            </label>
          </div>

          {/* Redaction Mode */}
          {privacyEnabled && (
            <div style={{ marginBottom: "1.5rem" }}>
              <label
                style={{ display: "block", fontWeight: "500", marginBottom: "0.75rem", color: "var(--text)" }}
              >
                Redaction Level
              </label>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    cursor: "pointer",
                    padding: "0.75rem",
                    borderRadius: "4px",
                    backgroundColor: redactionMode === "emails_phones" ? "color-mix(in srgb, var(--accent) 15%, transparent)" : "var(--panel-2)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <input
                    type="radio"
                    checked={redactionMode === "emails_phones"}
                    onChange={() => setRedactionMode("emails_phones")}
                    style={{ cursor: "pointer" }}
                  />
                  <div>
                    <div style={{ fontWeight: "500" }}>Emails & Phone Numbers</div>
                    <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
                      Redact email addresses and phone numbers only
                    </div>
                  </div>
                </label>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    cursor: "pointer",
                    padding: "0.75rem",
                    borderRadius: "4px",
                    backgroundColor: redactionMode === "emails_phones_names" ? "color-mix(in srgb, var(--accent) 15%, transparent)" : "var(--panel-2)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <input
                    type="radio"
                    checked={redactionMode === "emails_phones_names"}
                    onChange={() => setRedactionMode("emails_phones_names")}
                    style={{ cursor: "pointer" }}
                  />
                  <div>
                    <div style={{ fontWeight: "500" }}>Emails, Phone Numbers & Names</div>
                    <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
                      Also redact common person names (more aggressive)
                    </div>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* Info Text */}
          <div
            style={{
              padding: "1rem",
              backgroundColor: "var(--panel-2)",
              borderRadius: "4px",
              fontSize: "0.85rem",
              color: "var(--muted)",
              marginTop: "1.5rem",
            }}
          >
            <strong style={{ color: "var(--text)" }}>Default: Privacy OFF</strong>
            <br />
            When privacy is disabled, your task text is sent to OpenAI as-is for better AI understanding.
            Enable privacy if your tasks contain sensitive information like emails, phone numbers, or names.
          </div>
        </div>

        {/* Data Export/Import */}
        <div
          style={{
            backgroundColor: "var(--panel)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            padding: "2rem",
            color: "var(--text)",
            marginTop: "2rem",
          }}
        >
          <h2 style={{ marginBottom: "1rem", fontSize: "1.25rem" }}>Data Backup & Restore</h2>
          <p style={{ color: "var(--muted)", marginBottom: "1.5rem", fontSize: "0.9rem" }}>
            Export all your data to JSON or CSV. Import from a previous backup to restore or merge data.
          </p>

          {/* Export Section */}
          <div style={{ marginBottom: "2rem" }}>
            <h3 style={{ fontSize: "1rem", marginBottom: "0.75rem", color: "var(--text)" }}>Export</h3>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button
                onClick={handleExportJson}
                disabled={exporting}
                className="btn btn-primary"
                style={{
                  padding: "0.75rem 1.5rem",
                  opacity: exporting ? 0.6 : 1,
                  cursor: exporting ? "not-allowed" : "pointer",
                }}
              >
                {exporting ? "Exporting..." : "Export JSON (Full Backup)"}
              </button>
              <button
                onClick={handleExportCsv}
                disabled={exporting}
                style={{
                  padding: "0.75rem 1.5rem",
                  backgroundColor: "var(--panel-2)",
                  color: "var(--text)",
                  border: "1px solid var(--border)",
                  borderRadius: "4px",
                  fontSize: "1rem",
                  cursor: exporting ? "not-allowed" : "pointer",
                  opacity: exporting ? 0.6 : 1,
                }}
              >
                {exporting ? "Exporting..." : "Export CSV (Tasks Only)"}
              </button>
            </div>
            <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: "0.5rem" }}>
              JSON includes all data: tasks, settings, summaries, focus layouts
            </div>
          </div>

          {/* Import Section */}
          <div>
            <h3 style={{ fontSize: "1rem", marginBottom: "0.75rem", color: "var(--text)" }}>Import</h3>

            {/* File picker */}
            <div style={{ marginBottom: "1rem" }}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileSelect}
                disabled={importing}
                style={{
                  padding: "0.5rem",
                  border: "1px solid var(--border)",
                  borderRadius: "4px",
                  backgroundColor: "var(--panel-2)",
                  color: "var(--text)",
                  cursor: importing ? "not-allowed" : "pointer",
                }}
              />
            </div>

            {/* Import mode */}
            {importFile && (
              <div style={{ marginBottom: "1rem" }}>
                <div style={{ marginBottom: "0.5rem", fontSize: "0.9rem", fontWeight: "500" }}>
                  Import Mode
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      cursor: "pointer",
                      padding: "0.5rem",
                      borderRadius: "4px",
                      backgroundColor: importMode === "append" ? "color-mix(in srgb, var(--accent) 15%, transparent)" : "transparent",
                    }}
                  >
                    <input
                      type="radio"
                      checked={importMode === "append"}
                      onChange={() => setImportMode("append")}
                      disabled={importing}
                    />
                    <div>
                      <div style={{ fontWeight: "500" }}>Append / Merge</div>
                      <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
                        Add new items, skip duplicates, replace settings
                      </div>
                    </div>
                  </label>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      cursor: "pointer",
                      padding: "0.5rem",
                      borderRadius: "4px",
                      backgroundColor: importMode === "replace" ? "color-mix(in srgb, var(--danger) 15%, transparent)" : "transparent",
                    }}
                  >
                    <input
                      type="radio"
                      checked={importMode === "replace"}
                      onChange={() => setImportMode("replace")}
                      disabled={importing}
                    />
                    <div>
                      <div style={{ fontWeight: "500", color: importMode === "replace" ? "var(--danger)" : "var(--text)" }}>
                        Replace Everything
                      </div>
                      <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
                        ⚠️ Clear all existing data and restore from backup
                      </div>
                    </div>
                  </label>
                </div>
              </div>
            )}

            {/* Preview */}
            {importFile && (
              <div
                style={{
                  padding: "1rem",
                  backgroundColor: "var(--panel-2)",
                  borderRadius: "4px",
                  marginBottom: "1rem",
                  border: "1px solid var(--border)",
                }}
              >
                <div style={{ fontSize: "0.9rem", fontWeight: "500", marginBottom: "0.5rem" }}>
                  Preview
                </div>
                <div style={{ fontSize: "0.85rem", color: "var(--muted)", lineHeight: "1.6" }}>
                  {(() => {
                    const preview = getBackupPreview(importFile);
                    return (
                      <>
                        <div>Tasks: {preview.tasks}</div>
                        <div>Settings: {preview.settings ? "Yes" : "No"}</div>
                        <div>Summaries: {preview.summaries}</div>
                        <div>Focus Layouts: {preview.layouts}</div>
                        <div>Exported: {new Date(preview.exportedAt).toLocaleString()}</div>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* Import button */}
            {importFile && (
              <button
                onClick={handleImportConfirm}
                disabled={importing}
                className="btn btn-primary"
                style={{
                  padding: "0.75rem 1.5rem",
                  opacity: importing ? 0.6 : 1,
                  cursor: importing ? "not-allowed" : "pointer",
                  marginBottom: "1rem",
                }}
              >
                {importing ? "Importing..." : `Confirm Import (${importMode})`}
              </button>
            )}

            {/* Error Message */}
            {importError && (
              <div
                style={{
                  padding: "0.75rem",
                  backgroundColor: "color-mix(in srgb, var(--danger) 15%, transparent)",
                  color: "var(--danger)",
                  borderRadius: "4px",
                  marginBottom: "1rem",
                  fontSize: "0.9rem",
                  border: "1px solid var(--border)",
                }}
              >
                {importError}
              </div>
            )}

            {/* Success Message */}
            {importSuccess && (
              <div
                style={{
                  padding: "0.75rem",
                  backgroundColor: "color-mix(in srgb, var(--accent-2) 15%, transparent)",
                  color: "var(--accent-2)",
                  borderRadius: "4px",
                  marginBottom: "1rem",
                  fontSize: "0.9rem",
                  border: "1px solid var(--border)",
                }}
              >
                {importSuccess}
              </div>
            )}
          </div>
        </div>

        {/* Advanced Section */}
        <div
          style={{
            backgroundColor: "var(--panel)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            padding: "2rem",
            color: "var(--text)",
            marginTop: "2rem",
          }}
        >
          <h2 style={{ marginBottom: "1rem", fontSize: "1.25rem" }}>Advanced</h2>
          <p style={{ color: "var(--muted)", marginBottom: "1.5rem", fontSize: "0.9rem" }}>
            Force refresh and clear cached app data.
          </p>

          <div>
            <h3 style={{ fontSize: "1rem", marginBottom: "0.75rem", color: "var(--text)" }}>
              Cache Management
            </h3>
            <button
              onClick={handleInvalidateCache}
              style={{
                padding: "0.75rem 1.5rem",
                backgroundColor: "var(--panel-2)",
                color: "var(--text)",
                border: "1px solid var(--border)",
                borderRadius: "4px",
                fontSize: "1rem",
                cursor: "pointer",
              }}
            >
              Invalidate cache & reload
            </button>
            <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: "0.5rem" }}>
              Clears cached app shell. You'll get the newest version after deploying updates.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
