"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ingestFiles, ingestText, type IngestResult } from "@/src/lib/feedIngest";
import { getFollowedProjects, getProjects, type Project } from "@/src/lib/registry";
import { detectProject } from "@/src/lib/textParsers";

/**
 * Global intake: drop files anywhere, paste anywhere (outside inputs), or press
 * Ctrl+Shift+V to open the capture panel. Everything lands in the project feed.
 */
export default function UniversalDrop() {
  const router = useRouter();
  const [dragging, setDragging] = useState(false);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [projectId, setProjectId] = useState<string>("");
  const [userChose, setUserChose] = useState(false);
  const [sourceDate, setSourceDate] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; href?: string } | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const dragCount = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setProjects(getProjects());
  }, [open]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const report = useCallback(
    (r: IngestResult, what: string) => {
      const parts: string[] = [];
      if (r.registryImport) {
        parts.push(
          `Progress report imported: ${r.registryImport.mine} of ${r.registryImport.projects} projects are yours, ${r.registryImport.changes.length} change${r.registryImport.changes.length === 1 ? "" : "s"}.`
        );
        setToast({ msg: parts.join(" "), href: "/projects" });
        return;
      }
      if (r.items.length) {
        const first = r.items[0];
        const where = first.project_name ? `to ${first.project_name}` : "to the feed (no project matched)";
        parts.push(`Added ${what} ${where}. Triage running.`);
      }
      if (r.duplicates) parts.push(`${r.duplicates} duplicate${r.duplicates === 1 ? "" : "s"} skipped.`);
      if (r.errors.length) parts.push(r.errors.join(" "));
      if (parts.length) setToast({ msg: parts.join(" "), href: r.items.length ? `/feed?project=${r.items[0].project_id ?? "none"}` : undefined });
    },
    []
  );

  // ---- Drag and drop anywhere ----
  useEffect(() => {
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragCount.current++;
      setDragging(true);
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragCount.current = Math.max(0, dragCount.current - 1);
      if (dragCount.current === 0) setDragging(false);
    };
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onDrop = async (e: DragEvent) => {
      dragCount.current = 0;
      setDragging(false);
      if (!hasFiles(e)) return;
      e.preventDefault();
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (!files.length) return;
      setBusy(true);
      try {
        const r = await ingestFiles(files);
        report(r, files.length === 1 ? files[0].name : `${files.length} files`);
      } finally {
        setBusy(false);
      }
    };
    document.addEventListener("dragenter", onEnter);
    document.addEventListener("dragleave", onLeave);
    document.addEventListener("dragover", onOver);
    document.addEventListener("drop", onDrop);
    return () => {
      document.removeEventListener("dragenter", onEnter);
      document.removeEventListener("dragleave", onLeave);
      document.removeEventListener("dragover", onOver);
      document.removeEventListener("drop", onDrop);
    };
  }, [report]);

  // ---- Paste anywhere (outside editable fields) and keyboard shortcut ----
  useEffect(() => {
    const isEditable = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
    };
    const onPaste = async (e: ClipboardEvent) => {
      if (isEditable(e.target)) return;
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length) {
        e.preventDefault();
        setBusy(true);
        try {
          const r = await ingestFiles(files.map((f, i) => (f.name ? f : new File([f], `pasted-${Date.now()}-${i}.png`, { type: f.type }))));
          report(r, files.length === 1 ? "pasted image" : `${files.length} pasted files`);
        } finally {
          setBusy(false);
        }
        return;
      }
      const t = e.clipboardData?.getData("text/plain") ?? "";
      if (t.trim().length < 3) return;
      e.preventDefault();
      setText(t);
      setOpen(true);
    };
    const onKey = async (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "v") {
        e.preventDefault();
        setOpen(true);
        try {
          const t = await navigator.clipboard.readText();
          if (t) setText(t);
        } catch {
          /* clipboard permission denied; user pastes manually */
        }
      }
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("paste", onPaste);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("keydown", onKey);
    };
  }, [report]);

  // Auto-detect project as text changes
  useEffect(() => {
    if (!open) return;
    if (userChose) return;
    const m = detectProject(text, projects);
    setProjectId(m ? m.project.id : "");
  }, [text, open, projects, userChose]);

  useEffect(() => {
    if (open) setTimeout(() => textareaRef.current?.focus(), 50);
    else {
      setText("");
      setProjectId("");
      setUserChose(false);
      setSourceDate("");
    }
  }, [open]);

  const submit = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      // Only force the project when the user picked it; otherwise let ingest detect (records "alias")
      const r = await ingestText(text, { projectId: userChose ? projectId || null : null, sourceDate: sourceDate || null });
      report(r, "text");
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const detected = projectId ? projects.find((p) => p.id === projectId) : null;
  const followed = getFollowedProjects();
  const others = projects.filter((p) => !p.mine && !p.pinned);

  return (
    <>
      {/* Drag overlay */}
      {dragging && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2000,
            backgroundColor: "color-mix(in srgb, var(--accent) 12%, rgba(0,0,0,0.55))",
            border: "3px dashed var(--accent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <div className="card" style={{ padding: "1.5rem 2rem", fontSize: "1.1rem", fontWeight: 600 }}>
            Drop to add to the project feed
            <div style={{ fontSize: "0.8rem", color: "var(--muted)", fontWeight: 400, marginTop: "0.25rem" }}>
              .eml, .msg, .txt, images, and the progress report .xlsm are parsed here on your machine
            </div>
          </div>
        </div>
      )}

      {/* Floating capture button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Capture to feed (Ctrl+Shift+V)"
        className="btn btn-primary"
        style={{
          position: "fixed",
          right: "1.25rem",
          bottom: "1.25rem",
          zIndex: 1500,
          borderRadius: "999px",
          padding: "0.7rem 1.1rem",
          boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
          opacity: busy ? 0.7 : 1,
        }}
      >
        {busy ? "Working…" : "＋ Capture"}
      </button>

      {/* Capture panel */}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
          style={{ position: "fixed", inset: 0, zIndex: 1600, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "4rem 1rem" }}
        >
          <div className="card" style={{ width: "min(760px, 100%)", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Capture to feed</h2>
              <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>Teams thread, email chain, hallway note. Ctrl+Enter to add.</span>
            </div>
            <textarea
              ref={textareaRef}
              className="textarea"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") submit();
              }}
              placeholder="Paste here…"
              style={{ minHeight: "220px", fontFamily: "inherit", fontSize: "0.9rem", width: "100%" }}
            />
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
              <label style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                Project{" "}
                <select className="input" value={projectId} onChange={(e) => { setProjectId(e.target.value); setUserChose(true); }} style={{ marginLeft: "0.25rem" }}>
                  <option value="">Auto-detect / none</option>
                  {followed.length > 0 && (
                    <optgroup label="My projects">
                      {followed.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {others.length > 0 && (
                    <optgroup label="Other projects">
                      {others.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </label>
              <label style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                Date{" "}
                <input className="input" type="date" value={sourceDate} onChange={(e) => setSourceDate(e.target.value)} style={{ marginLeft: "0.25rem" }} />
              </label>
              {detected && !userChose && (
                <span className="badge" style={{ fontSize: "0.7rem" }}>
                  Detected: {detected.name}
                </span>
              )}
              <div style={{ marginLeft: "auto", display: "flex", gap: "0.5rem" }}>
                <button type="button" className="btn" onClick={() => setOpen(false)}>
                  Cancel
                </button>
                <button type="button" className="btn btn-primary" disabled={busy || !text.trim()} onClick={submit}>
                  {busy ? "Adding…" : "Add to feed"}
                </button>
              </div>
            </div>
            {projects.length === 0 && (
              <div style={{ fontSize: "0.78rem", color: "var(--warn)" }}>
                No projects in the registry yet. Drop the Substation Design Progress Report (.xlsm) anywhere to import your projects, or add one on the Projects page.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          role="status"
          style={{
            position: "fixed",
            bottom: "4.5rem",
            right: "1.25rem",
            zIndex: 1700,
            maxWidth: "420px",
            padding: "0.85rem 1rem",
            backgroundColor: "var(--panel)",
            color: "var(--text)",
            borderRadius: "0.75rem",
            border: "1px solid var(--border)",
            boxShadow: "0 4px 12px rgba(0,0,0,0.35)",
            fontSize: "0.85rem",
            display: "flex",
            gap: "0.75rem",
            alignItems: "center",
          }}
        >
          <span>{toast.msg}</span>
          {toast.href && (
            <button type="button" className="btn" style={{ padding: "0.3rem 0.6rem", fontSize: "0.75rem" }} onClick={() => { router.push(toast.href!); setToast(null); }}>
              Open
            </button>
          )}
        </div>
      )}
    </>
  );
}
