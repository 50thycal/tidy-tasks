"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { getRegistry, nextMilestone, setPinned, addManualProject, reportAgeDays, type Project, type RegistryDoc } from "@/src/lib/registry";
import { ingestFiles } from "@/src/lib/feedIngest";
import { getWorkSettingsV2 } from "@/src/lib/settings";

export default function ProjectsPage() {
  const [doc, setDoc] = useState<RegistryDoc | null>(null);
  const [query, setQuery] = useState("");
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const myLast = getWorkSettingsV2().my_last_name;

  const reload = () => setDoc(getRegistry());
  useEffect(() => {
    reload();
  }, []);

  const followed = useMemo(() => (doc?.projects ?? []).filter((p) => p.mine || p.pinned), [doc]);
  const others = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (doc?.projects ?? []).filter((p) => !p.mine && !p.pinned);
    if (!q) return list.slice(0, 0);
    return list
      .filter((p) => [p.name, p.substation, ...p.aliases, ...p.work_orders.map((w) => `${w.description} ${w.bmcd_lead ?? ""} ${w.itc_lead ?? ""}`)].join(" ").toLowerCase().includes(q))
      .slice(0, 30);
  }, [doc, query]);

  const onImport = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await ingestFiles(Array.from(files));
      if (r.registryImport) {
        const ri = r.registryImport;
        setMsg(`Imported: ${ri.mine} of ${ri.projects} projects are yours (lead = "${myLast || "not set"}"). ${ri.changes.length} change${ri.changes.length === 1 ? "" : "s"} since last import.${ri.warnings.length ? ` ${ri.warnings.length} warning(s) in console.` : ""}`);
        if (ri.warnings.length) console.warn("Progress report warnings:", ri.warnings);
      } else if (r.errors.length) setMsg(r.errors.join(" "));
      else setMsg("That file is not the progress report. It was added to the feed instead.");
      reload();
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const age = doc ? reportAgeDays(doc) : null;

  if (!doc) return <p style={{ color: "var(--muted)" }}>Loading…</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", paddingBottom: "5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <h1 style={{ marginBottom: "0.25rem", fontSize: "1.75rem" }}>Projects</h1>
          <p style={{ color: "var(--muted)", fontSize: "0.85rem", margin: 0 }}>
            {doc.last_issue_date ? (
              <>
                Progress report issued <strong>{doc.last_issue_date}</strong>
                {age !== null && age > 21 && <span style={{ color: "var(--warn)" }}> · {age} days old, drop the latest report</span>}
                {" · "}
                {doc.projects.length} projects in the registry
              </>
            ) : (
              "No progress report imported yet."
            )}
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <input ref={fileRef} type="file" accept=".xlsm,.xlsx" hidden onChange={(e) => onImport(e.target.files)} />
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? "Importing…" : "Import progress report"}
          </button>
        </div>
      </div>

      {!myLast && (
        <div className="card" style={{ padding: "0.75rem 1rem", fontSize: "0.85rem", borderLeft: "3px solid var(--warn)" }}>
          Set your last name in <Link href="/settings">Settings</Link> so the importer can tell which projects are yours (it matches the "BMcD Project Lead" column).
        </div>
      )}
      {msg && (
        <div className="card" style={{ padding: "0.75rem 1rem", fontSize: "0.85rem" }}>
          {msg}
        </div>
      )}

      <section>
        <h2 style={{ fontSize: "1.05rem", marginBottom: "0.5rem" }}>My projects</h2>
        {followed.length === 0 ? (
          <div className="card" style={{ padding: "1.25rem", color: "var(--muted)", fontSize: "0.85rem" }}>
            Import the progress report or add a project below.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "0.75rem" }}>
            {followed.map((p) => (
              <ProjectCard key={p.id} p={p} onChange={reload} />
            ))}
          </div>
        )}
      </section>

      <section className="card" style={{ padding: "1rem" }}>
        <h2 style={{ fontSize: "1.05rem", marginBottom: "0.5rem" }}>Follow another project</h2>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <input className="input" placeholder="Search the registry: name, work order, lead…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ flex: 1, minWidth: "220px" }} />
        </div>
        {others.length > 0 && (
          <div style={{ marginTop: "0.6rem", display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            {others.map((p) => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem", padding: "0.35rem 0.5rem", borderRadius: "0.5rem", backgroundColor: "var(--panel-2)" }}>
                <div style={{ minWidth: 0 }}>
                  <strong>{p.name}</strong>{" "}
                  <span style={{ color: "var(--muted)", fontSize: "0.75rem" }}>
                    {p.work_orders.map((w) => w.wo).join(", ")} · {p.work_orders[0]?.bmcd_lead ?? "no lead"} · {p.work_orders[0]?.status}
                  </span>
                </div>
                <button type="button" className="btn" style={{ padding: "0.25rem 0.6rem", fontSize: "0.72rem" }} onClick={() => { setPinned(p.id, true); reload(); }}>
                  Follow
                </button>
              </div>
            ))}
          </div>
        )}
        <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>Not in the report?</span>
          <input className="input" placeholder="Project name" value={manual} onChange={(e) => setManual(e.target.value)} style={{ width: "220px" }} />
          <button type="button" className="btn" disabled={!manual.trim()} onClick={() => { addManualProject(manual); setManual(""); reload(); }}>
            Add
          </button>
        </div>
      </section>
    </div>
  );
}

function ProjectCard({ p, onChange }: { p: Project; onChange: () => void }) {
  const nm = nextMilestone(p);
  const active = p.work_orders.filter((w) => w.status === "ACTIVE");
  const delayed = p.work_orders.some((w) => w.ifc_on_track === "DELAYED");
  const comment = p.work_orders.map((w) => w.comments).find((c) => c && c !== "COMPLETE");
  return (
    <div className="card" style={{ padding: "0.9rem 1rem", display: "flex", flexDirection: "column", gap: "0.4rem", borderLeft: `3px solid ${delayed ? "var(--warn)" : "var(--accent-2)"}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "0.5rem" }}>
        <Link href={`/projects/${p.id}`} style={{ fontWeight: 600, fontSize: "1rem", color: "var(--text)", textDecoration: "none" }}>
          {p.name}
        </Link>
        <span style={{ fontSize: "0.68rem", color: "var(--muted)" }}>{p.mine ? "Lead" : "Following"}</span>
      </div>
      <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
        {p.work_orders.map((w) => w.wo).join(", ") || "no work orders"}
        {active.length > 0 && ` · ${active.length} active`}
        {p.work_orders[0]?.itc_lead && ` · ITC: ${p.work_orders[0].itc_lead}`}
      </div>
      {nm ? (
        <div style={{ fontSize: "0.82rem" }}>
          <strong>Next:</strong> {nm.label} <span style={{ color: delayed ? "var(--warn)" : "var(--text)" }}>{nm.date ?? "TBD"}</span>
        </div>
      ) : (
        <div style={{ fontSize: "0.82rem", color: "var(--muted)" }}>{p.work_orders.length ? "All milestones complete" : "No milestones"}</div>
      )}
      {comment && <div style={{ fontSize: "0.75rem", color: "var(--warn)" }}>{comment}</div>}
      {!p.mine && (
        <button type="button" className="btn" style={{ alignSelf: "flex-start", padding: "0.2rem 0.5rem", fontSize: "0.68rem" }} onClick={() => { setPinned(p.id, false); onChange(); }}>
          Unfollow
        </button>
      )}
    </div>
  );
}
