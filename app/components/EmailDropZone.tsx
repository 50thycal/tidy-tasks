"use client";

import { useState, useRef, useCallback } from "react";
import { parseEmailFile, isSupportedEmailFile } from "@/src/lib/emailParser";

interface EmailDropZoneProps {
  onEmailsParsed: (emails: Array<{ fileName: string; text: string }>) => void;
  isProcessing: boolean;
}

export default function EmailDropZone({ onEmailsParsed, isProcessing }: EmailDropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [showPasteArea, setShowPasteArea] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCountRef = useRef(0);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      setParseError(null);
      const fileArray = Array.from(files);

      if (fileArray.length === 0) return;

      const unsupported = fileArray.filter((f) => !isSupportedEmailFile(f));
      if (unsupported.length > 0 && fileArray.length === unsupported.length) {
        setParseError(
          `Unsupported file type: ${unsupported.map((f) => f.name).join(", ")}. Use .eml or .txt files.`
        );
        return;
      }

      const supported = fileArray.filter(isSupportedEmailFile);
      const results: Array<{ fileName: string; text: string }> = [];

      for (const file of supported) {
        try {
          const text = await parseEmailFile(file);
          results.push({ fileName: file.name, text });
        } catch (err) {
          console.error(`Failed to parse ${file.name}:`, err);
          setParseError(`Failed to parse ${file.name}. Try pasting the email text instead.`);
        }
      }

      if (results.length > 0) {
        onEmailsParsed(results);
      }
    },
    [onEmailsParsed]
  );

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCountRef.current++;
    if (dragCountRef.current === 1) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCountRef.current--;
    if (dragCountRef.current === 0) {
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCountRef.current = 0;
      setIsDragOver(false);

      if (isProcessing) return;

      const { files } = e.dataTransfer;
      if (files.length > 0) {
        handleFiles(files);
      } else {
        // Handle dropped text
        const text = e.dataTransfer.getData("text/plain");
        if (text.trim()) {
          onEmailsParsed([{ fileName: "Dropped text", text: text.trim() }]);
        }
      }
    },
    [handleFiles, onEmailsParsed, isProcessing]
  );

  const handlePasteSubmit = () => {
    if (!pasteText.trim()) return;
    onEmailsParsed([{ fileName: "Pasted email", text: pasteText.trim() }]);
    setPasteText("");
    setShowPasteArea(false);
  };

  return (
    <div>
      {/* Drop Zone */}
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => !isProcessing && fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${isDragOver ? "var(--accent)" : "var(--border)"}`,
          borderRadius: "12px",
          padding: "3rem 2rem",
          textAlign: "center",
          cursor: isProcessing ? "default" : "pointer",
          backgroundColor: isDragOver
            ? "color-mix(in srgb, var(--accent) 10%, transparent)"
            : "var(--panel)",
          transition: "all 0.2s ease",
          opacity: isProcessing ? 0.6 : 1,
        }}
      >
        <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>
          {isProcessing ? "..." : isDragOver ? "+" : ""}
        </div>
        <div
          style={{
            fontSize: "1.1rem",
            fontWeight: "500",
            color: "var(--text)",
            marginBottom: "0.5rem",
          }}
        >
          {isProcessing
            ? "Processing emails..."
            : isDragOver
            ? "Drop emails here"
            : "Drop email files here"}
        </div>
        <div style={{ fontSize: "0.875rem", color: "var(--muted)" }}>
          {isProcessing
            ? "AI is extracting action items"
            : "Drag .eml or .txt files, or click to browse"}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".eml,.txt,.msg"
          multiple
          onChange={(e) => {
            if (e.target.files) {
              handleFiles(e.target.files);
              e.target.value = ""; // Reset so same file can be re-selected
            }
          }}
          style={{ display: "none" }}
        />
      </div>

      {/* Error message */}
      {parseError && (
        <div
          style={{
            marginTop: "0.75rem",
            padding: "0.75rem 1rem",
            backgroundColor: "color-mix(in srgb, #ef4444 15%, var(--panel))",
            border: "1px solid color-mix(in srgb, #ef4444 30%, var(--border))",
            borderRadius: "8px",
            color: "#ef4444",
            fontSize: "0.875rem",
          }}
        >
          {parseError}
        </div>
      )}

      {/* Paste option */}
      <div style={{ marginTop: "1rem", textAlign: "center" }}>
        {!showPasteArea ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowPasteArea(true);
            }}
            disabled={isProcessing}
            style={{
              background: "none",
              border: "none",
              color: "var(--accent)",
              cursor: isProcessing ? "default" : "pointer",
              fontSize: "0.875rem",
              textDecoration: "underline",
              opacity: isProcessing ? 0.5 : 1,
            }}
          >
            Or paste email text directly
          </button>
        ) : (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ textAlign: "left" }}
          >
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Paste the full email text here (including headers like From, To, Subject if available)..."
              style={{
                width: "100%",
                minHeight: "150px",
                padding: "0.75rem",
                backgroundColor: "var(--panel)",
                color: "var(--text)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                fontSize: "0.875rem",
                fontFamily: "monospace",
                resize: "vertical",
              }}
            />
            <div
              style={{
                display: "flex",
                gap: "0.5rem",
                marginTop: "0.5rem",
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={() => {
                  setShowPasteArea(false);
                  setPasteText("");
                }}
                className="btn btn-muted"
                style={{ fontSize: "0.875rem" }}
              >
                Cancel
              </button>
              <button
                onClick={handlePasteSubmit}
                disabled={!pasteText.trim() || isProcessing}
                className="btn btn-primary"
                style={{ fontSize: "0.875rem" }}
              >
                Extract Action Items
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
