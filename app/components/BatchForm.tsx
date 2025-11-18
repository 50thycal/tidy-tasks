import { useState } from "react";
import { getWorkSettingsV2 } from "@/src/lib/settings";

interface BatchFormProps {
  onClean: (lines: string[], options: BatchCleanOptions) => void;
  isProcessing: boolean;
}

export interface BatchCleanOptions {
  redactionEnabled: boolean;
  redactionEntities: Array<"emails" | "phones" | "proper_names">;
}

export default function BatchForm({ onClean, isProcessing }: BatchFormProps) {
  const [rawText, setRawText] = useState("");

  const handleClean = () => {
    const lines = rawText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length === 0) {
      return;
    }

    // Get privacy settings from global settings
    const settings = getWorkSettingsV2();
    const privacyEnabled = settings.privacy?.enabled ?? false;
    const redactionMode = settings.privacy?.redactionMode ?? "emails_phones";

    // Map redaction mode to entities array
    let redactionEntities: Array<"emails" | "phones" | "proper_names"> = [];
    if (privacyEnabled) {
      if (redactionMode === "emails_phones") {
        redactionEntities = ["emails", "phones"];
      } else if (redactionMode === "emails_phones_names") {
        redactionEntities = ["emails", "phones", "proper_names"];
      }
    }

    onClean(lines, {
      redactionEnabled: privacyEnabled,
      redactionEntities,
    });
  };

  const handleClear = () => {
    setRawText("");
  };

  const lineCount = rawText.split("\n").filter((line) => line.trim().length > 0).length;

  return (
    <div className="card" style={{ padding: "1.5rem" }}>
      <div style={{ marginBottom: "1rem" }}>
        <label
          htmlFor="batch-input"
          style={{
            display: "block",
            fontWeight: "500",
            marginBottom: "0.5rem",
            color: "var(--text)",
          }}
        >
          Paste your tasks (one per line)
        </label>
        <textarea
          id="batch-input"
          className="textarea"
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder="Write out task&#10;Use spaces for additional tasks"
          disabled={isProcessing}
          style={{
            minHeight: "200px",
            fontFamily: "monospace",
            resize: "vertical",
          }}
        />
        <div className="text-muted" style={{ fontSize: "0.85rem", marginTop: "0.25rem" }}>
          {lineCount} {lineCount === 1 ? "task" : "tasks"}
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: "0.75rem" }}>
        <button
          type="button"
          onClick={handleClean}
          disabled={isProcessing || lineCount === 0}
          className="btn btn-primary"
        >
          {isProcessing ? "Processing..." : "Clean All with AI"}
        </button>
        <button
          type="button"
          onClick={handleClear}
          disabled={isProcessing}
          className="btn btn-muted"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
