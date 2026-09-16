"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import FeedItemCard from "@/app/components/FeedItemCard";
import { getProjectById, getProjects, updateProject, nextMilestone, projectPeople, getRegistry, type Project, type MeetingSettings } from "@/src/lib/registry";
import { getFeedItemsForProject, type FeedItem } from "@/src/lib/feedStore";
import { onFeedItemUpdated, onFeedChanged } from "@/src/lib/feedIngest";
import { getInboxItems, type InboxItem } from "@/src/lib/clientStore";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [tasks, setTasks] = useState<InboxItem[]>([]);
  const [aliasDraft, setAliasDraft] = useState("");
  const [mounted, setMounted] = useState(false);

  const reload = async () => {
    const p = getProjectById(params.id);
    setProject(p);
    setProjects(getProjects());
    setFeed(p ? await getFeedItemsForProject(p.id) : []);
    setTasks(p ? getInboxItems().filter((t) => t.status !== "done" && t.result.project && t.result.project.toLowerCase() === p.name.toLowerCase()) : []);
  };

  useEffect(() => {
    setMounted(true);
    reload();
    const offItems = onFeedItemUpdated((it) => setFeed((prev) => prev.map((f) => (f.id === it.id ? it : f))));
    const offAdded = onFeedChanged(() => void reload());
    return () => {
      offItems();
      offAdded();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const changes = useMemo(() => {
    if (!project) return [];
    const wos = new Set(project.work_orders.map((w) => w.wo));
    return getRegistry().imports.slice(0, 3).flatMap((imp) => imp.changes.filter((c) => wos.has(c.wo)).map((c) => ({ ...c, issue: imp.issue_date })));
  }, [project]);

  if (!mounted) return <p style={{ color: "var(--muted)" }}>Loading…</p>;
  if (!project)
    return (
      <div>
        <p>Project not found.</p>
        <Link href="/projects">Back to projects</Link>
      </div>
    );

  const nm = nextMilestone(project);
  const people = projectPeople(project);
  const openFeed = feed.filter((f) => !f.parent_id && (f.status === "new" || f.status === "triaged"));
  const waiting = openFeed.flatMap((f) => (f.triage?.actions ?? []).filter((a) => a.court === "theirs" && !a.linked_task_id).map((a) => ({ ...a, from: f.title })));
  const setMeeting = (patch: Partial<MeetingSettings>) => {
    updateProject(project.id, { meeting: { ...project.meeting, ...patch } });
    reload();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", paddingBottom: "5rem" }}>
      <div>
        <Link href="/projects" style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
          ← Projects
        </Link>
        <div style={{ display: "flex", alignItems: "baseline", gap: "0.75rem", flexWrap: "wrap" }}>
          <h1 style={{ margin: "0.25rem 0", fontSize: "1.75rem" }}>{project.name}</h1>
          <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{project.substation !== project.name ? project.substation : ""}</span>
          <span className="badge" style={{ fontSize: "0.7rem" }}>{project.mine ? "Lead" : project.pinned ? "Following" : "Registry"}</span>
        </div>
        <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
          {nm ? (
            <>
              Next milestone: <strong style={{ color: "var(--text)" }}>{nm.label}</strong> {nm.date ?? "TBD"} ({nm.wo})
            </>
          ) : (
            "No open milestones"
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1rem" }}>
        {/* Work orders and milestones */}
        <section className="card" style={{ padding: "1rem", gridColumn: "1 / -1" }}>
          <h2 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>Work orders</h2>
          {project.work_orders.length === 0 && <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>Manual project, no work orders from the report.</p>}
          {project.work_orders.map((w) => (
            <div key={w.wo} style={{ marginBottom: "0.9rem" }}>
              <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", alignItems: "baseline", fontSize: "0.85rem" }}>
                <strong>{w.wo}</strong>
                <span>{w.description}</span>
                <span className="badge" style={{ fontSize: "0.66rem" }}>{w.status}</span>
                {w.ifc_on_track && (
                  <span className="badge" style={{ fontSize: "0.66rem", color: w.ifc_on_track === "DELAYED" ? "var(--warn)" : "var(--accent-2)" }}>
                    IFC {w.ifc ?? "TBD"} · {w.ifc_on_track}
                  </span>
                )}
                <span style={{ color: "var(--muted)", fontSize: "0.75rem" }}>
                  {w.region} · proj # {w.bmcd_project_no ?? "—"} · ITC {w.itc_lead ?? "—"} / {w.itc_supervisor ?? "—"}
                </span>
              </div>
              {w.comments && w.comments !== "COMPLETE" && <div style={{ fontSize: "0.78rem", color: "var(--warn)", marginTop: "0.2rem" }}>{w.comments}</div>}
              {w.milestones.length > 0 && (
                <div style={{ overflowX: "auto", marginTop: "0.4rem" }}>
                  <table style={{ borderCollapse: "collapse", fontSize: "0.78rem", width: "100%" }}>
                    <thead>
                      <tr style={{ color: "var(--muted)", textAlign: "left" }}>
                        <th style={{ padding: "0.2rem 0.5rem 0.2rem 0" }}>Milestone</th>
                        <th style={{ padding: "0.2rem 0.5rem" }}>Proposed</th>
                        <th style={{ padding: "0.2rem 0.5rem" }}>Target</th>
                        <th style={{ padding: "0.2rem 0.5rem" }}>Final</th>
                        <th style={{ padding: "0.2rem 0.5rem" }}>%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {w.milestones.map((m) => (
                        <tr key={m.label} style={{ borderTop: "1px solid var(--border)" }}>
                          <td style={{ padding: "0.25rem 0.5rem 0.25rem 0" }}>{m.label}</td>
                          <td style={{ padding: "0.25rem 0.5rem", color: "var(--muted)" }}>{m.proposed ?? "—"}</td>
                          <td style={{ padding: "0.25rem 0.5rem", color: m.adjusted ? "var(--warn)" : "var(--text)", fontWeight: m.adjusted ? 600 : 400 }} title={m.adjusted ? "Adjusted from proposed" : ""}>
                            {m.target ?? "—"}
                          </td>
                          <td style={{ padding: "0.25rem 0.5rem" }}>{m.final ?? "—"}</td>
                          <td style={{ padding: "0.25rem 0.5rem" }}>{m.pct_complete === null ? "—" : `${Math.round(m.pct_complete * 100)}%`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
          {changes.length > 0 && (
            <details style={{ fontSize: "0.78rem", marginTop: "0.5rem" }}>
              <summary style={{ cursor: "pointer", color: "var(--muted)" }}>{changes.length} change{changes.length === 1 ? "" : "s"} in recent report imports</summary>
              <ul style={{ margin: "0.4rem 0 0 1rem", padding: 0 }}>
                {changes.map((c, i) => (
                  <li key={i}>
                    <span style={{ color: "var(--muted)" }}>{c.issue}</span> {c.wo} {c.field.replace(/^milestone:/, "").replace(/:/g, " ")}: {c.from ?? "—"} → {c.to ?? "—"}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>

        {/* Meeting settings */}
        <section className="card" style={{ padding: "1rem" }}>
          <h2 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>Meeting</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.85rem" }}>
            <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
              Cadence
              <select className="input" value={project.meeting.cadence} onChange={(e) => setMeeting({ cadence: e.target.value as MeetingSettings["cadence"], })} style={{ width: "auto" }}>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Every two weeks</option>
                <option value="none">No regular meeting</option>
              </select>
            </label>
            <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
              Day
              <select className="input" value={project.meeting.weekday} onChange={(e) => setMeeting({ weekday: Number(e.target.value) })} style={{ width: "auto" }}>
                {WEEKDAYS.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
              Last meeting
              <input className="input" type="date" value={project.meeting.last_meeting_at ?? ""} onChange={(e) => setMeeting({ last_meeting_at: e.target.value || null })} style={{ width: "auto" }} />
            </label>
            <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
              Stale after (days)
              <input className="input" type="number" min={1} value={project.stale_after_days} onChange={(e) => { updateProject(project.id, { stale_after_days: Math.max(1, Number(e.target.value) || 7) }); reload(); }} style={{ width: "5rem" }} />
            </label>
            <Link href={`/projects/${project.id}/meeting`} className="btn btn-primary" style={{ textAlign: "center", textDecoration: "none", marginTop: "0.25rem" }}>
              Open meeting prep
            </Link>
          </div>
        </section>

        {/* People and aliases */}
        <section className="card" style={{ padding: "1rem" }}>
          <h2 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>People</h2>
          {people.length === 0 ? (
            <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>None from the report.</p>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: "none", fontSize: "0.85rem", display: "grid", gap: "0.2rem" }}>
              {people.map((pp) => (
                <li key={`${pp.org}:${pp.name}`}>
                  <strong>{pp.name}</strong> <span style={{ color: "var(--muted)" }}>{pp.role}</span>
                </li>
              ))}
            </ul>
          )}
          <h3 style={{ fontSize: "0.85rem", margin: "0.9rem 0 0.35rem" }}>Aliases</h3>
          <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
            {project.aliases.map((a) => (
              <span key={a} className="badge" style={{ fontSize: "0.68rem" }}>
                {a}
                <button type="button" title="Remove" onClick={() => { updateProject(project.id, { aliases: project.aliases.filter((x) => x !== a) }); reload(); }} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", marginLeft: "0.25rem", padding: 0 }}>
                  ×
                </button>
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.4rem" }}>
            <input className="input" placeholder="Add alias (e.g. SNAP)" value={aliasDraft} onChange={(e) => setAliasDraft(e.target.value)} style={{ flex: 1, fontSize: "0.8rem" }} />
            <button type="button" className="btn" disabled={!aliasDraft.trim()} onClick={() => { updateProject(project.id, { aliases: Array.from(new Set([...project.aliases, aliasDraft.trim()])) }); setAliasDraft(""); reload(); }} style={{ fontSize: "0.8rem" }}>
              Add
            </button>
          </div>
          <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: "0.4rem" }}>Aliases route pasted content to this project automatically.</div>
        </section>

        {/* Waiting on */}
        <section className="card" style={{ padding: "1rem" }}>
          <h2 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>Waiting on</h2>
          {waiting.length === 0 ? (
            <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>Nothing outstanding in the feed.</p>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: "none", fontSize: "0.82rem", display: "grid", gap: "0.35rem" }}>
              {waiting.map((a, i) => (
                <li key={i}>
                  <span className="badge" style={{ fontSize: "0.64rem", color: "var(--warn)" }}>{a.owner ?? "?"}</span> {a.title}
                  {a.follow_up_by && <span style={{ color: "var(--muted)" }}> · by {a.follow_up_by}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Open tasks */}
        <section className="card" style={{ padding: "1rem" }}>
          <h2 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>Open tasks ({tasks.length})</h2>
          {tasks.length === 0 ? (
            <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
              None. <Link href="/inbox">Inbox</Link>
            </p>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: "none", fontSize: "0.82rem", display: "grid", gap: "0.3rem" }}>
              {tasks.slice(0, 15).map((t) => (
                <li key={t.id} style={{ display: "flex", gap: "0.5rem", alignItems: "baseline" }}>
                  <span className="badge" style={{ fontSize: "0.62rem" }}>{t.status === "follow-up" ? "waiting" : t.status}</span>
                  <span>{t.result.title}</span>
                  {t.result.due_at && <span style={{ color: "var(--muted)", fontSize: "0.7rem" }}>{t.result.due_at.slice(0, 10)}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Feed */}
      <section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h2 style={{ fontSize: "1.05rem", marginBottom: "0.5rem" }}>Feed ({openFeed.length} open)</h2>
          <Link href={`/feed?project=${project.id}`} style={{ fontSize: "0.8rem" }}>
            Open in Feed
          </Link>
        </div>
        {openFeed.length === 0 ? (
          <div className="card" style={{ padding: "1.25rem", color: "var(--muted)", fontSize: "0.85rem" }}>
            Nothing yet. Paste a Teams thread or drop an email anywhere; it will land here when it mentions {project.name} or one of its aliases.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {openFeed.map((f) => {
              const kids = feed.filter((x) => x.parent_id === f.id).length;
              return (
                <FeedItemCard
                  key={f.id}
                  item={f}
                  projects={projects}
                  isChainParent={kids > 0}
                  childCount={kids}
                  onChange={(u) => setFeed((prev) => (u ? prev.map((x) => (x.id === u.id ? u : x)) : prev.filter((x) => x.id !== f.id)))}
                />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
