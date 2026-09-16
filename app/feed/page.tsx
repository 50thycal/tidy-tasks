"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import FeedItemCard from "@/app/components/FeedItemCard";
import { getAllFeedItems, type FeedItem, type FeedStatus } from "@/src/lib/feedStore";
import { onFeedItemUpdated, triageItems, onTriageProgress, triageQueue, onFeedChanged } from "@/src/lib/feedIngest";
import { getProjects, type Project } from "@/src/lib/registry";

type StatusFilter = "open" | "new" | "meeting" | "covered" | "all";

function FeedPageInner() {
  const params = useSearchParams();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectFilter, setProjectFilter] = useState<string>(params.get("project") ?? "");
  const [status, setStatus] = useState<StatusFilter>("open");
  const [mounted, setMounted] = useState(false);
  const [queue, setQueue] = useState(() => triageQueue());

  const reload = async () => {
    const all = await getAllFeedItems();
    setItems(all);
    setProjects(getProjects());
    // Items that never finished triage (e.g. the tab was closed mid-run) get retried once they are a minute old
    const cutoff = Date.now() - 60_000;
    const pending = all.filter((i) => !i.triage && !i.triage_error && i.kind !== "docx" && i.kind !== "pdf" && i.kind !== "xlsx" && new Date(i.captured_at).getTime() < cutoff && (i.parent_id || !all.some((c) => c.parent_id === i.id)));
    if (pending.length) void triageItems(pending);
  };

  useEffect(() => {
    setMounted(true);
    reload();
    const offItems = onFeedItemUpdated((it) =>
      setItems((prev) => (prev.some((p) => p.id === it.id) ? prev.map((p) => (p.id === it.id ? it : p)) : prev))
    );
    // Items captured from anywhere in the app land here without a page reload
    const offAdded = onFeedChanged(() => void reload());
    const offProgress = onTriageProgress(() => setQueue(triageQueue()));
    return () => {
      offItems();
      offAdded();
      offProgress();
    };
  }, []);

  const followed = projects.filter((p) => p.mine || p.pinned);
  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const i of items) {
      if (i.parent_id) continue;
      const k = i.project_id ?? "none";
      c.set(k, (c.get(k) ?? 0) + 1);
    }
    return c;
  }, [items]);

  const visible = useMemo(() => {
    return items.filter((i) => {
      if (i.parent_id) return false; // chains render under their parent
      if (projectFilter === "none" && i.project_id) return false;
      if (projectFilter && projectFilter !== "none" && i.project_id !== projectFilter) return false;
      const s: FeedStatus = i.status;
      if (status === "open") return s === "new" || s === "triaged";
      if (status === "new") return s === "new" || (s === "triaged" && !i.triage);
      if (status === "meeting") return (s === "new" || s === "triaged") && !!i.triage?.include_in_meeting;
      if (status === "covered") return s === "covered" || s === "archived";
      return true;
    });
  }, [items, projectFilter, status]);

  const childrenOf = (id: string) => items.filter((i) => i.parent_id === id);

  const onChange = (updated: FeedItem | null, id: string) => {
    if (updated === null) setItems((prev) => prev.filter((p) => p.id !== id && p.parent_id !== id));
    else setItems((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  };

  if (!mounted) return <p style={{ color: "var(--muted)" }}>Loading…</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem", paddingBottom: "5rem" }}>
      <div>
        <h1 style={{ marginBottom: "0.25rem", fontSize: "1.75rem" }}>Feed</h1>
        <p style={{ color: "var(--muted)", fontSize: "0.85rem", margin: 0 }}>
          Everything you drop or paste, dated and triaged. Drop files anywhere, paste anywhere, or press Ctrl+Shift+V.
        </p>
      </div>

      {queue.total > 0 && (
        <div className="card" style={{ padding: "0.6rem 0.9rem", display: "flex", alignItems: "center", gap: "0.6rem", fontSize: "0.82rem", borderLeft: "3px solid var(--warn)" }}>
          <span className="tidy-spin" style={{ color: "var(--warn)" }} aria-hidden />
          <span>
            Triaging {queue.running} of {queue.total} item{queue.total === 1 ? "" : "s"}
            {queue.queued > 0 && ` · ${queue.queued} waiting`}
          </span>
          <span style={{ color: "var(--muted)" }}>Each item is read once and turned into a summary, topics, dates and actions. Results appear as they finish.</span>
        </div>
      )}

      {projects.length === 0 && (
        <div className="card" style={{ padding: "1rem", fontSize: "0.85rem" }}>
          No projects yet. Drop the <strong>Substation Design Progress Report</strong> (.xlsm) anywhere in the app to import your projects, or{" "}
          <Link href="/projects">add one manually</Link>.
        </div>
      )}

      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
        <Chip active={projectFilter === ""} onClick={() => setProjectFilter("")}>
          All ({items.filter((i) => !i.parent_id).length})
        </Chip>
        {followed.map((p) => (
          <Chip key={p.id} active={projectFilter === p.id} onClick={() => setProjectFilter(p.id)}>
            {p.name} ({counts.get(p.id) ?? 0})
          </Chip>
        ))}
        <Chip active={projectFilter === "none"} onClick={() => setProjectFilter("none")}>
          No project ({counts.get("none") ?? 0})
        </Chip>
        {projects.some((p) => !p.mine && !p.pinned && (counts.get(p.id) ?? 0) > 0) && (
          <select className="input" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem", width: "auto" }}>
            <option value="">Other projects…</option>
            {projects
              .filter((p) => !p.mine && !p.pinned && (counts.get(p.id) ?? 0) > 0)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({counts.get(p.id)})
                </option>
              ))}
          </select>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: "0.25rem" }}>
          {items.some((i) => i.triage_error) && (
            <button type="button" className="btn" style={{ padding: "0.3rem 0.65rem", fontSize: "0.76rem" }} onClick={() => void triageItems(items.filter((i) => i.triage_error))}>
              Retry failed triage
            </button>
          )}
          {(["open", "meeting", "new", "covered", "all"] as StatusFilter[]).map((s) => (
            <Chip key={s} active={status === s} onClick={() => setStatus(s)}>
              {s === "open" ? "Open" : s === "meeting" ? "For meeting" : s === "new" ? "Untriaged" : s === "covered" ? "Covered" : "All"}
            </Chip>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="card" style={{ padding: "2rem", textAlign: "center", color: "var(--muted)" }}>
          Nothing here. Paste a Teams thread or drop an email to get started.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {visible.map((item) => {
            const kids = childrenOf(item.id);
            return (
              <div key={item.id} style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                <FeedItemCard item={item} projects={projects} onChange={(u) => onChange(u, item.id)} compact={kids.length > 0} isChainParent={kids.length > 0} childCount={kids.length} />
                {kids.length > 0 && (
                  <div style={{ marginLeft: "1.5rem", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                    {kids.map((k) => (
                      <FeedItemCard key={k.id} item={k} projects={projects} onChange={(u) => onChange(u, k.id)} compact />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "0.3rem 0.65rem",
        backgroundColor: active ? "var(--accent)" : "var(--panel-2)",
        color: active ? "white" : "var(--muted)",
        border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
        borderRadius: "999px",
        fontSize: "0.76rem",
        cursor: "pointer",
        fontWeight: active ? 600 : 400,
      }}
    >
      {children}
    </button>
  );
}

export default function FeedPage() {
  return (
    <Suspense fallback={<p style={{ color: "var(--muted)" }}>Loading…</p>}>
      <FeedPageInner />
    </Suspense>
  );
}
