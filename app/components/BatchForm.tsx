import { useState } from "react";

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
  const [showOptions, setShowOptions] = useState(false);
  const [redactionEnabled, setRedactionEnabled] = useState(true);
  const [redactionEntities, setRedactionEntities] = useState<Array<"emails" | "phones" | "proper_names">>(
    ["emails", "phones"]
  );

  const handleClean = () => {
    const lines = rawText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length === 0) {
      return;
    }

    onClean(lines, {
      redactionEnabled,
      redactionEntities,
    });
  };

  const handleClear = () => {
    setRawText("");
  };

  const toggleRedactionEntity = (entity: "emails" | "phones" | "proper_names") => {
    if (redactionEntities.includes(entity)) {
      setRedactionEntities(redactionEntities.filter((e) => e !== entity));
    } else {
      setRedactionEntities([...redactionEntities, entity]);
    }
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
          placeholder="Email Brian about easement before Friday&#10;Review RDR package 2 hours&#10;Call contractor re: grading sketch&#10;Prep weekly progress email..."
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

      {/* Options (collapsed) */}
      <div style={{ marginBottom: "1rem" }}>
        <button
          type="button"
          onClick={() => setShowOptions(!showOptions)}
          style={{
            background: "none",
            border: "none",
            padding: "0.5rem 0",
            fontSize: "0.9rem",
            color: "var(--accent)",
            cursor: "pointer",
            textDecoration: "underline",
          }}
        >
          {showOptions ? "▼" : "▶"} Advanced Options
        </button>

        {showOptions && (
          <div
            style={{
              marginTop: "0.75rem",
              padding: "1rem",
              backgroundColor: "var(--panel-2)",
              borderRadius: "0.75rem",
              border: "1px solid var(--border)",
            }}
          >
            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <input
                  type="checkbox"
                  checked={redactionEnabled}
                  onChange={(e) => setRedactionEnabled(e.target.checked)}
                />
                <span style={{ fontSize: "0.9rem", color: "var(--text)" }}>
                  Enable redaction (privacy mode)
                </span>
              </label>
            </div>

            {redactionEnabled && (
              <div style={{ marginLeft: "1.5rem" }}>
                <div className="text-muted" style={{ fontSize: "0.85rem", marginBottom: "0.5rem" }}>
                  Redact:
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                  <input
                    type="checkbox"
                    checked={redactionEntities.includes("emails")}
                    onChange={() => toggleRedactionEntity("emails")}
                  />
                  <span style={{ fontSize: "0.85rem", color: "var(--text)" }}>Email addresses</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                  <input
                    type="checkbox"
                    checked={redactionEntities.includes("phones")}
                    onChange={() => toggleRedactionEntity("phones")}
                  />
                  <span style={{ fontSize: "0.85rem", color: "var(--text)" }}>Phone numbers</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <input
                    type="checkbox"
                    checked={redactionEntities.includes("proper_names")}
                    onChange={() => toggleRedactionEntity("proper_names")}
                  />
                  <span style={{ fontSize: "0.85rem", color: "var(--text)" }}>Proper names</span>
                </label>
              </div>
            )}
          </div>
        )}
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
