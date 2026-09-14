"use client";

import { useState } from "react";
import type { FeedItem, FeedAction } from "@/src/lib/feedStore";
import { updateFeedItem, deleteFeedItem } from "@/src/lib/feedStore";
import { triageItem, createTasksFromActions } from "@/src/lib/feedIngest";
import type { Project } from "@/src/lib/registry";

const KIND_ICON: Record<string, string> = {
  text: "📝",
  teams: "💬",
  email: "✉️",
  docx: "📄",
  xlsx: "📊",
  pdf: "📕",
  image: "🖼️",
  progress_report: "📊",
  registry_change: "📅",
};

const COURT_STYLE: Record<FeedAction["court"], { bg: string; fg: string; label: string }> = {
  mine: { bg: "color-mix(in srgb, var(--accent) 18%, transparent)", fg: "var(--accent)", label: "Mine" },
  theirs: { bg: "color-mix(in srgb, var(--warn) 18%, transparent)", fg: "var(--warn)", label: "Waiting on" },
  team: { bg: "color-mix(in srgb, var(--muted) 18%, transparent)", fg: "var(--muted)", label: "Team" },
};

interface Props {
  item: FeedItem;
  projects: Project[];
  onChange: (item: FeedItem | null) => void;
  compact?: boolean;
}

export default function FeedItemCard({ item, projects, onChange, compact = false }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const t = item.triage;

  const setProject = async (id: string) => {
    const p = projects.find((x) => x.id === id) ?? null;
    const updated = await updateFeedItem(item.id, { project_id: p?.id ?? null, project_name: p?.name ?? null, project_confidence: "manual" });
    if (updated) onChange(updated);
  };

  const retriage = async () => {
    setBusy(true);
    try {
      onChange(await triageItem(item));
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (status: FeedItem["status"]) => {
    const updated = await updateFeedItem(item.id, { status });
    if (updated) onChange(updated);
  };

  const remove = async () => {
    if (!confirm("Delete this feed item?")) return;
    await deleteFeedItem(item.id);
    onChange(null);
  };

  const addTasks = async () => {
    if (!selected.size) return;
    setBusy(true);
    try {
      await createTasksFromActions(item, Array.from(selected));
      setSelected(new Set());
      const { getFeedItem } = await import("@/src/lib/feedStore");
      const fresh = await getFeedItem(item.id);
      if (fresh) onChange(fresh);
    } finally {
      setBusy(false);
    }
  };

  const meeting = t?.include_in_meeting;

  return (
    <div
      className="card"
      style={{
        padding: compact ? "0.6rem 0.8rem" : "0.85rem 1rem",
        borderLeft: `3px solid ${meeting ? "var(--accent-2)" : t ? "var(--border)" : "var(--warn)"}`,
        opacity: item.status === "covered" || item.status === "archived" ? 0.6 : 1,
      }}
    >
      <div style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start" }}>
        <span style={{ fontSize: "1.1rem", lineHeight: 1 }} title={item.kind}>
          {KIND_ICON[item.kind] ?? "•"}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "baseline", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              style={{ background: "none", border: "none", padding: 0, color: "var(--text)", fontWeight: 600, fontSize: "0.92rem", cursor: "pointer", textAlign: "left" }}
            >
              {item.title}
            </button>
            <span style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
              {item.source_date ?? "undated"}
              {item.people.length > 0 && ` · ${item.people.slice(0, 3).join(", ")}${item.people.length > 3 ? "…" : ""}`}
            </span>
          </div>

          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginTop: "0.3rem", alignItems: "center" }}>
            <select
              className="input"
              value={item.project_id ?? ""}
              onChange={(e) => setProject(e.target.value)}
              style={{ fontSize: "0.72rem", padding: "0.15rem 0.4rem", minWidth: 0, width: "auto" }}
              title={`Project (${item.project_confidence})`}
            >
              <option value="">No project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {t ? (
              <span className="badge" style={{ fontSize: "0.68rem", backgroundColor: meeting ? "color-mix(in srgb, var(--accent-2) 15%, transparent)" : "transparent", color: meeting ? "var(--accent-2)" : "var(--muted)" }} title={t.include_reason}>
                {meeting ? "Meeting" : "FYI"}
                {t.agenda_section ? ` · ${t.agenda_section}` : ""}
              </span>
            ) : item.triage_error ? (
              <span className="badge" style={{ fontSize: "0.68rem", color: "var(--danger)" }} title={item.triage_error}>
                Triage failed
              </span>
            ) : (
              <span className="badge" style={{ fontSize: "0.68rem", color: "var(--warn)" }}>
                Triaging…
              </span>
            )}
            {t?.topics.slice(0, 4).map((tp) => (
              <span key={tp} className="badge" style={{ fontSize: "0.66rem" }}>
                {tp}
              </span>
            ))}
            <span style={{ marginLeft: "auto", fontSize: "0.68rem", color: "var(--muted)", textTransform: "uppercase" }}>{item.status}</span>
          </div>

          {t && <div style={{ fontSize: "0.85rem", marginTop: "0.4rem", color: "var(--text)" }}>{t.summary}</div>}

          {t && t.actions.length > 0 && (
            <div style={{ marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              {t.actions.map((a, i) => {
                const cs = COURT_STYLE[a.court];
                return (
                  <label key={i} style={{ display: "flex", gap: "0.5rem", alignItems: "center", fontSize: "0.8rem" }}>
                    {a.linked_task_id ? (
                      <span title="Task created" style={{ color: "var(--accent-2)" }}>✓</span>
                    ) : (
                      <input
                        type="checkbox"
                        checked={selected.has(i)}
                        onChange={(e) => {
                          const n = new Set(selected);
                          e.target.checked ? n.add(i) : n.delete(i);
                          setSelected(n);
                        }}
                      />
                    )}
                    <span className="badge" style={{ fontSize: "0.64rem", backgroundColor: cs.bg, color: cs.fg, whiteSpace: "nowrap" }}>
                      {cs.label}
                      {a.owner ? ` ${a.owner}` : ""}
                    </span>
                    <span style={{ textDecoration: a.linked_task_id ? "line-through" : "none", opacity: a.linked_task_id ? 0.7 : 1 }}>{a.title}</span>
                    {(a.due_at || a.follow_up_by) && <span style={{ color: "var(--muted)", fontSize: "0.7rem" }}>{a.due_at ?? a.follow_up_by}</span>}
                  </label>
                );
              })}
              {selected.size > 0 && (
                <button type="button" className="btn btn-primary" onClick={addTasks} disabled={busy} style={{ alignSelf: "flex-start", padding: "0.3rem 0.7rem", fontSize: "0.75rem", marginTop: "0.25rem" }}>
                  Create {selected.size} task{selected.size === 1 ? "" : "s"}
                </button>
              )}
            </div>
          )}

          {expanded && (
            <div style={{ marginTop: "0.6rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {t && (t.decisions.length > 0 || t.open_questions.length > 0 || t.dates.length > 0) && (
                <div style={{ fontSize: "0.78rem", color: "var(--muted)", display: "grid", gap: "0.25rem" }}>
                  {t.decisions.map((d, i) => (
                    <div key={`d${i}`}>✔ {d}</div>
                  ))}
                  {t.open_questions.map((q, i) => (
                    <div key={`q${i}`}>? {q}</div>
                  ))}
                  {t.dates.map((d, i) => (
                    <div key={`t${i}`}>
                      📅 {d.date} {d.label}
                    </div>
                  ))}
                </div>
              )}
              <pre style={{ whiteSpace: "pre-wrap", fontSize: "0.75rem", color: "var(--muted)", maxHeight: "320px", overflow: "auto", margin: 0, padding: "0.6rem", backgroundColor: "var(--panel-2)", borderRadius: "0.5rem" }}>
                {item.text || "(no text)"}
              </pre>
              <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                <button type="button" className="btn" style={{ padding: "0.3rem 0.6rem", fontSize: "0.72rem" }} onClick={retriage} disabled={busy}>
                  {busy ? "…" : "Re-triage"}
                </button>
                {item.status !== "covered" && (
                  <button type="button" className="btn" style={{ padding: "0.3rem 0.6rem", fontSize: "0.72rem" }} onClick={() => setStatus("covered")}>
                    Mark covered
                  </button>
                )}
                {item.status !== "archived" ? (
                  <button type="button" className="btn" style={{ padding: "0.3rem 0.6rem", fontSize: "0.72rem" }} onClick={() => setStatus("archived")}>
                    Archive
                  </button>
                ) : (
                  <button type="button" className="btn" style={{ padding: "0.3rem 0.6rem", fontSize: "0.72rem" }} onClick={() => setStatus("triaged")}>
                    Unarchive
                  </button>
                )}
                <button type="button" className="btn btn-danger" style={{ padding: "0.3rem 0.6rem", fontSize: "0.72rem", marginLeft: "auto" }} onClick={remove}>
                  Delete
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
