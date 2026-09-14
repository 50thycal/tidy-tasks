"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { AgendaSection, FeedItem, LivingAgenda } from "@/src/lib/feedStore";
import { getProjectById, type Project } from "@/src/lib/registry";
import { parseOutline, serializeOutline, applyInsert, removeBullet, markStale, newBullet, newSection, type PrepProposals } from "@/src/lib/agenda";
import { loadAgenda, saveAgendaSections, itemsForPrep, requestProposals, finalizeMeeting, nextMeetingDate } from "@/src/lib/meetingPrep";
import { createTasksFromActions } from "@/src/lib/feedIngest";

type Decision = "accepted" | "rejected";

export default function MeetingPrepPage() {
  const params = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [agenda, setAgenda] = useState<LivingAgenda | null>(null);
  const [sections, setSections] = useState<AgendaSection[]>([]);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [proposals, setProposals] = useState<PrepProposals | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"" | "prep" | "finalize" | "save">("");
  const [error, setError] = useState<string | null>(null);
  const [seedOpen, setSeedOpen] = useState(false);
  const [seedText, setSeedText] = useState("");
  const [meetingDate, setMeetingDate] = useState("");
  const [copied, setCopied] = useState(false);
  const [editingBullet, setEditingBullet] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    (async () => {
      const p = getProjectById(params.id);
      setProject(p);
      if (p) {
        const a = await loadAgenda(p.id);
        setAgenda(a);
        setSections(a.sections);
        setItems(await itemsForPrep(p.id));
        setMeetingDate(nextMeetingDate(p) ?? new Date().toISOString().slice(0, 10));
        if (a.sections.length === 0) setSeedOpen(true);
      }
      setMounted(true);
    })();
  }, [params.id]);

  const persist = async (next: AgendaSection[]) => {
    setSections(next);
    if (!project) return;
    setBusy("save");
    try {
      setAgenda(await saveAgendaSections(project.id, next));
      setDirty(false);
    } finally {
      setBusy("");
    }
  };

  const seed = async () => {
    const parsed = parseOutline(seedText);
    if (!parsed.length) return;
    await persist(parsed);
    setSeedText("");
    setSeedOpen(false);
  };

  const prep = async () => {
    if (!project || !agenda) return;
    setBusy("prep");
    setError(null);
    setProposals(null);
    setDecisions({});
    setEdits({});
    try {
      const fresh = await itemsForPrep(project.id);
      setItems(fresh);
      const a = await loadAgenda(project.id);
      const p = await requestProposals(project, { ...a, sections }, fresh);
      setProposals(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  };

  const decide = (id: string, d: Decision) => setDecisions((prev) => ({ ...prev, [id]: prev[id] === d ? undefined! : d }));

  /** Sections with accepted proposals applied (preview and the basis for finalize). */
  const merged = useMemo(() => {
    if (!proposals) return sections;
    let next = sections;
    for (const ins of proposals.inserts) {
      if (decisions[ins.id] !== "accepted") continue;
      next = applyInsert(next, { ...ins, text: edits[ins.id] ?? ins.text });
    }
    for (const st of proposals.stale) {
      if (decisions[`stale:${st.bullet_id}`] !== "accepted") continue;
      next = removeBullet(next, st.bullet_id);
    }
    return next;
  }, [sections, proposals, decisions, edits]);

  const acceptAll = () => {
    if (!proposals) return;
    const d: Record<string, Decision> = {};
    for (const i of proposals.inserts) d[i.id] = "accepted";
    setDecisions(d);
  };

  const applyAccepted = async () => {
    await persist(merged);
    setProposals(null);
    setDecisions({});
    setEdits({});
  };

  const finalize = async () => {
    if (!project) return;
    setBusy("finalize");
    setError(null);
    try {
      const covered = items.map((i) => i.id);
      const { agenda: a, text } = await finalizeMeeting({ project, sections: merged, meetingDate, coveredItemIds: covered });
      setAgenda(a);
      setSections(a.sections);
      setProposals(null);
      setDecisions({});
      setEdits({});
      setItems(await itemsForPrep(project.id));
      setProject(getProjectById(project.id));
      await copyText(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  };

  const copyText = async (text?: string) => {
    const t = text ?? serializeOutline(merged);
    try {
      await navigator.clipboard.writeText(t);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: open in a textarea via prompt
      window.prompt("Copy the outline:", t);
    }
  };

  // ---- Manual outline editing ----
  const updateBulletText = (bid: string, text: string) => {
    setSections((prev) => prev.map((s) => ({ ...s, bullets: s.bullets.map((b) => (b.id === bid ? { ...b, text } : b)) })));
    setDirty(true);
  };
  const shiftDepth = (bid: string, delta: number) => {
    setSections((prev) => prev.map((s) => ({ ...s, bullets: s.bullets.map((b) => (b.id === bid ? { ...b, depth: Math.max(0, Math.min(5, b.depth + delta)) } : b)) })));
    setDirty(true);
  };
  const addBullet = (sectionId: string, afterId: string | null) => {
    setSections((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s;
        const bullets = [...s.bullets];
        const idx = afterId ? bullets.findIndex((b) => b.id === afterId) : -1;
        const nb = newBullet("", idx >= 0 ? bullets[idx].depth : 0);
        bullets.splice(idx + 1, 0, nb);
        setEditingBullet(nb.id);
        return { ...s, bullets };
      })
    );
    setDirty(true);
  };
  const deleteBullet = (bid: string) => {
    setSections((prev) => removeBullet(prev, bid, false));
    setDirty(true);
  };
  const addSection = () => {
    const heading = window.prompt("New section heading");
    if (!heading?.trim()) return;
    setSections((prev) => [...prev, newSection(heading)]);
    setDirty(true);
  };
  const renameSection = (sid: string) => {
    const s = sections.find((x) => x.id === sid);
    const heading = window.prompt("Section heading", s?.heading ?? "");
    if (!heading?.trim()) return;
    setSections((prev) => prev.map((x) => (x.id === sid ? { ...x, heading: heading.trim() } : x)));
    setDirty(true);
  };
  const deleteSection = (sid: string) => {
    if (!confirm("Delete this section and its bullets?")) return;
    setSections((prev) => prev.filter((x) => x.id !== sid));
    setDirty(true);
  };

  if (!mounted) return <p style={{ color: "var(--muted)" }}>Loading…</p>;
  if (!project)
    return (
      <div>
        <p>Project not found.</p>
        <Link href="/projects">Back to projects</Link>
      </div>
    );

  const insertsBySection = new Map<string, typeof proposals extends null ? never : NonNullable<typeof proposals>["inserts"]>();
  if (proposals) {
    for (const ins of proposals.inserts) {
      const key = ins.section;
      if (!insertsBySection.has(key)) insertsBySection.set(key, []);
      insertsBySection.get(key)!.push(ins);
    }
  }
  const knownHeadings = new Set(sections.map((s) => s.heading.toLowerCase()));
  const newHeadingInserts = proposals ? proposals.inserts.filter((i) => !sections.some((s) => matchesHeading(s.heading, i.section))) : [];
  const acceptedCount = proposals ? proposals.inserts.filter((i) => decisions[i.id] === "accepted").length : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem", paddingBottom: "6rem" }}>
      <div>
        <Link href={`/projects/${project.id}`} style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
          ← {project.name}
        </Link>
        <div style={{ display: "flex", alignItems: "baseline", gap: "0.75rem", flexWrap: "wrap" }}>
          <h1 style={{ margin: "0.25rem 0", fontSize: "1.6rem" }}>Meeting prep · {project.name}</h1>
          <span style={{ color: "var(--muted)", fontSize: "0.82rem" }}>
            Last meeting {agenda?.last_meeting_at ?? "never"} · {items.length} new item{items.length === 1 ? "" : "s"} since
          </span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="card" style={{ padding: "0.75rem 1rem", display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" className="btn btn-primary" onClick={prep} disabled={busy !== "" || sections.length === 0}>
          {busy === "prep" ? "Preparing…" : `Prep next meeting (${items.length})`}
        </button>
        <button type="button" className="btn" onClick={() => copyText()} disabled={sections.length === 0}>
          {copied ? "Copied" : "Copy outline"}
        </button>
        <button type="button" className="btn" onClick={() => setSeedOpen((v) => !v)}>
          {sections.length ? "Replace from pasted notes" : "Paste existing notes"}
        </button>
        {dirty && (
          <button type="button" className="btn btn-success" onClick={() => persist(sections)} disabled={busy !== ""}>
            {busy === "save" ? "Saving…" : "Save edits"}
          </button>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: "0.5rem", alignItems: "center", fontSize: "0.8rem" }}>
          <label style={{ color: "var(--muted)" }}>
            Meeting date <input className="input" type="date" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} style={{ width: "auto", marginLeft: "0.25rem" }} />
          </label>
          <button type="button" className="btn btn-success" onClick={finalize} disabled={busy !== "" || sections.length === 0 || !meetingDate} title="Saves the outline, marks the new items covered, stamps the meeting date, and copies the outline">
            {busy === "finalize" ? "Finalizing…" : "Finalize & copy"}
          </button>
        </div>
      </div>

      {error && (
        <div className="card" style={{ padding: "0.75rem 1rem", borderLeft: "3px solid var(--danger)", fontSize: "0.85rem" }}>
          {error}
        </div>
      )}

      {seedOpen && (
        <div className="card" style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <div style={{ fontSize: "0.85rem" }}>
            Paste the meeting notes you currently publish. Plain lines become section headings, lines starting with * or - become bullets, and indentation sets nesting.
            {sections.length > 0 && <strong> This replaces the current outline.</strong>}
          </div>
          <textarea className="textarea" value={seedText} onChange={(e) => setSeedText(e.target.value)} style={{ minHeight: "220px", fontFamily: "ui-monospace, monospace", fontSize: "0.8rem" }} placeholder={"LLMR REV 1\n\n* MR has been updated for the new Fence\n   * When will this be ready for Q4?"} />
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button type="button" className="btn btn-primary" onClick={seed} disabled={!seedText.trim()}>
              Use as living agenda
            </button>
            <button type="button" className="btn" onClick={() => setSeedOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {proposals && (
        <div className="card" style={{ padding: "0.9rem 1rem", borderLeft: "3px solid var(--accent)", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <div style={{ fontSize: "0.9rem" }}>{proposals.summary}</div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center", fontSize: "0.8rem" }}>
            <span style={{ color: "var(--muted)" }}>
              {proposals.inserts.length} proposed insert{proposals.inserts.length === 1 ? "" : "s"}, {proposals.stale.length} stale, {acceptedCount} accepted
            </span>
            <button type="button" className="btn" style={{ padding: "0.25rem 0.6rem", fontSize: "0.75rem" }} onClick={acceptAll}>
              Accept all inserts
            </button>
            <button type="button" className="btn btn-primary" style={{ padding: "0.25rem 0.6rem", fontSize: "0.75rem" }} onClick={applyAccepted} disabled={acceptedCount === 0 && !proposals.stale.some((s) => decisions[`stale:${s.bullet_id}`] === "accepted")}>
              Apply accepted to outline
            </button>
            <button type="button" className="btn" style={{ padding: "0.25rem 0.6rem", fontSize: "0.75rem" }} onClick={() => setProposals(null)}>
              Discard proposals
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: "1rem" }} className="meeting-grid">
        {/* Outline */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", minWidth: 0 }}>
          {sections.length === 0 && !seedOpen && (
            <div className="card" style={{ padding: "1.5rem", color: "var(--muted)", fontSize: "0.85rem" }}>
              No living agenda yet. Paste your current notes to seed it, or add a section.
            </div>
          )}
          {sections.map((s) => {
            const ins = proposals ? proposals.inserts.filter((i) => matchesHeading(s.heading, i.section)) : [];
            return (
              <section key={s.id} className="card" style={{ padding: "0.75rem 1rem" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
                  <h2 style={{ fontSize: "1rem", margin: 0, cursor: "pointer" }} onClick={() => renameSection(s.id)} title="Rename">
                    {s.heading}
                  </h2>
                  <span style={{ marginLeft: "auto", display: "flex", gap: "0.25rem" }}>
                    <IconBtn title="Add bullet" onClick={() => addBullet(s.id, null)}>
                      +
                    </IconBtn>
                    <IconBtn title="Delete section" onClick={() => deleteSection(s.id)}>
                      ×
                    </IconBtn>
                  </span>
                </div>
                <div style={{ marginTop: "0.4rem", display: "flex", flexDirection: "column", gap: "0.15rem" }}>
                  {s.bullets.map((b) => {
                    const staleProp = proposals?.stale.find((st) => st.bullet_id === b.id);
                    const staleAccepted = staleProp && decisions[`stale:${b.id}`] === "accepted";
                    const childInserts = ins.filter((i) => i.after_bullet_id === b.id);
                    return (
                      <div key={b.id}>
                        <div style={{ display: "flex", gap: "0.4rem", alignItems: "flex-start", marginLeft: `${b.depth * 1.25}rem`, fontSize: "0.86rem", opacity: staleAccepted ? 0.45 : 1, textDecoration: staleAccepted ? "line-through" : "none" }}>
                          <span style={{ color: "var(--muted)", userSelect: "none" }}>•</span>
                          {editingBullet === b.id ? (
                            <textarea
                              autoFocus
                              className="textarea"
                              value={b.text}
                              onChange={(e) => updateBulletText(b.id, e.target.value)}
                              onBlur={() => setEditingBullet(null)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                  e.preventDefault();
                                  setEditingBullet(null);
                                  addBullet(s.id, b.id);
                                }
                                if (e.key === "Tab") {
                                  e.preventDefault();
                                  shiftDepth(b.id, e.shiftKey ? -1 : 1);
                                }
                                if (e.key === "Escape") setEditingBullet(null);
                              }}
                              rows={2}
                              style={{ flex: 1, fontSize: "0.85rem", padding: "0.25rem 0.4rem" }}
                            />
                          ) : (
                            <span onClick={() => setEditingBullet(b.id)} style={{ flex: 1, cursor: "text", color: b.stale ? "var(--muted)" : "var(--text)" }}>
                              {b.text || <em style={{ color: "var(--muted)" }}>empty</em>}
                              {b.source_item_ids.length > 0 && <sup style={{ color: "var(--accent)", marginLeft: "0.2rem" }} title="From the feed">●</sup>}
                            </span>
                          )}
                          <span style={{ display: "flex", gap: "0.1rem", opacity: 0.6 }}>
                            <IconBtn title="Outdent (Shift+Tab)" onClick={() => shiftDepth(b.id, -1)}>
                              ‹
                            </IconBtn>
                            <IconBtn title="Indent (Tab)" onClick={() => shiftDepth(b.id, 1)}>
                              ›
                            </IconBtn>
                            <IconBtn title="Add bullet after" onClick={() => addBullet(s.id, b.id)}>
                              +
                            </IconBtn>
                            <IconBtn title="Delete bullet" onClick={() => deleteBullet(b.id)}>
                              ×
                            </IconBtn>
                          </span>
                        </div>
                        {staleProp && (
                          <ProposalRow kind="stale" depth={b.depth + 1} text={`Stale: ${staleProp.reason}`} decision={decisions[`stale:${b.id}`]} onDecide={(d) => decide(`stale:${b.id}`, d)} />
                        )}
                        {childInserts.map((i) => (
                          <ProposalRow key={i.id} kind="insert" depth={b.depth + 1} text={edits[i.id] ?? i.text} reason={i.reason} sources={i.source_item_ids.map((id) => items.find((x) => x.id === id)?.title ?? id)} decision={decisions[i.id]} onDecide={(d) => decide(i.id, d)} onEdit={(t) => setEdits((prev) => ({ ...prev, [i.id]: t }))} />
                        ))}
                      </div>
                    );
                  })}
                  {ins
                    .filter((i) => !i.after_bullet_id || !s.bullets.some((b) => b.id === i.after_bullet_id))
                    .map((i) => (
                      <ProposalRow key={i.id} kind="insert" depth={Math.min(i.depth, 1)} text={edits[i.id] ?? i.text} reason={i.reason} sources={i.source_item_ids.map((id) => items.find((x) => x.id === id)?.title ?? id)} decision={decisions[i.id]} onDecide={(d) => decide(i.id, d)} onEdit={(t) => setEdits((prev) => ({ ...prev, [i.id]: t }))} />
                    ))}
                </div>
              </section>
            );
          })}

          {newHeadingInserts.length > 0 && (
            <section className="card" style={{ padding: "0.75rem 1rem", borderStyle: "dashed" }}>
              <h2 style={{ fontSize: "1rem", margin: 0, color: "var(--accent)" }}>Proposed new sections</h2>
              {Array.from(new Set(newHeadingInserts.map((i) => i.section))).map((heading) => (
                <div key={heading} style={{ marginTop: "0.5rem" }}>
                  <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{heading}</div>
                  {newHeadingInserts
                    .filter((i) => i.section === heading)
                    .map((i) => (
                      <ProposalRow key={i.id} kind="insert" depth={0} text={edits[i.id] ?? i.text} reason={i.reason} sources={i.source_item_ids.map((id) => items.find((x) => x.id === id)?.title ?? id)} decision={decisions[i.id]} onDecide={(d) => decide(i.id, d)} onEdit={(t) => setEdits((prev) => ({ ...prev, [i.id]: t }))} />
                    ))}
                </div>
              ))}
            </section>
          )}

          <button type="button" className="btn" onClick={addSection} style={{ alignSelf: "flex-start" }}>
            + Add section
          </button>
          {!knownHeadings.size && null}
        </div>

        {/* Right rail */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <section className="card" style={{ padding: "0.75rem 1rem" }}>
            <h3 style={{ fontSize: "0.9rem", margin: "0 0 0.4rem" }}>Waiting on</h3>
            {proposals ? (
              proposals.waiting_on.length ? (
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "0.35rem", fontSize: "0.8rem" }}>
                  {proposals.waiting_on.map((w, i) => (
                    <li key={i}>
                      <span className="badge" style={{ fontSize: "0.64rem", color: "var(--warn)" }}>{w.owner}</span> {w.text}
                      {w.since && <span style={{ color: "var(--muted)" }}> · since {w.since}</span>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ color: "var(--muted)", fontSize: "0.8rem", margin: 0 }}>Nothing outstanding.</p>
              )
            ) : (
              <p style={{ color: "var(--muted)", fontSize: "0.8rem", margin: 0 }}>Run prep to build this list.</p>
            )}
          </section>

          <section className="card" style={{ padding: "0.75rem 1rem" }}>
            <h3 style={{ fontSize: "0.9rem", margin: "0 0 0.4rem" }}>New since last meeting ({items.length})</h3>
            {items.length === 0 ? (
              <p style={{ color: "var(--muted)", fontSize: "0.8rem", margin: 0 }}>Nothing new in the feed.</p>
            ) : (
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "0.4rem", fontSize: "0.78rem" }}>
                {items.map((it) => (
                  <li key={it.id} style={{ borderLeft: `2px solid ${it.triage?.include_in_meeting ? "var(--accent-2)" : "var(--border)"}`, paddingLeft: "0.4rem" }}>
                    <div style={{ fontWeight: 500 }}>{it.title}</div>
                    <div style={{ color: "var(--muted)" }}>
                      {it.source_date ?? "undated"} · {it.triage ? (it.triage.include_in_meeting ? "meeting" : "FYI") : it.triage_error ? "triage failed" : "triaging"}
                    </div>
                    {it.triage && it.triage.actions.some((a) => !a.linked_task_id) && (
                      <button
                        type="button"
                        className="btn"
                        style={{ padding: "0.15rem 0.45rem", fontSize: "0.68rem", marginTop: "0.2rem" }}
                        onClick={async () => {
                          await createTasksFromActions(it, it.triage!.actions.map((_, i) => i).filter((i) => !it.triage!.actions[i].linked_task_id));
                          setItems(await itemsForPrep(project.id));
                        }}
                      >
                        Create {it.triage.actions.filter((a) => !a.linked_task_id).length} task(s)
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {agenda && agenda.snapshots.length > 0 && (
            <section className="card" style={{ padding: "0.75rem 1rem" }}>
              <h3 style={{ fontSize: "0.9rem", margin: "0 0 0.4rem" }}>Past meetings</h3>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "0.3rem", fontSize: "0.78rem" }}>
                {agenda.snapshots.slice(0, 8).map((snap) => (
                  <li key={snap.meeting_id} style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                    <span>
                      {snap.date} · {snap.covered_item_ids.length} item{snap.covered_item_ids.length === 1 ? "" : "s"}
                    </span>
                    <button type="button" className="btn" style={{ padding: "0.1rem 0.4rem", fontSize: "0.66rem" }} onClick={() => copyText(snap.text)}>
                      Copy
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 900px) {
          .meeting-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

function matchesHeading(existing: string, proposed: string): boolean {
  const n = (h: string) => h.toLowerCase().replace(/[^a-z0-9\s/&-]/g, "").replace(/\s+/g, " ").trim();
  const a = n(existing);
  const b = n(proposed);
  if (!a || !b) return false;
  return a === b || ((a.includes(b) || b.includes(a)) && Math.min(a.length, b.length) >= 4);
}

function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" title={title} onClick={onClick} style={{ background: "none", border: "1px solid transparent", color: "var(--muted)", cursor: "pointer", padding: "0 0.3rem", borderRadius: "4px", fontSize: "0.85rem", lineHeight: 1.4 }}>
      {children}
    </button>
  );
}

function ProposalRow({
  kind,
  depth,
  text,
  reason,
  sources,
  decision,
  onDecide,
  onEdit,
}: {
  kind: "insert" | "stale";
  depth: number;
  text: string;
  reason?: string;
  sources?: string[];
  decision?: Decision;
  onDecide: (d: Decision) => void;
  onEdit?: (t: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const color = kind === "insert" ? "var(--accent-2)" : "var(--warn)";
  return (
    <div
      style={{
        marginLeft: `${depth * 1.25}rem`,
        marginTop: "0.15rem",
        padding: "0.35rem 0.5rem",
        borderRadius: "0.4rem",
        border: `1px dashed ${decision === "rejected" ? "var(--border)" : color}`,
        backgroundColor: decision === "accepted" ? `color-mix(in srgb, ${color} 12%, transparent)` : "transparent",
        opacity: decision === "rejected" ? 0.45 : 1,
        fontSize: "0.82rem",
        display: "flex",
        gap: "0.5rem",
        alignItems: "flex-start",
      }}
    >
      <span style={{ color }}>{kind === "insert" ? "+" : "−"}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        {editing && onEdit ? (
          <textarea autoFocus className="textarea" defaultValue={text} onBlur={(e) => { onEdit(e.target.value); setEditing(false); }} rows={2} style={{ width: "100%", fontSize: "0.82rem", padding: "0.25rem 0.4rem" }} />
        ) : (
          <span onClick={() => onEdit && setEditing(true)} style={{ cursor: onEdit ? "text" : "default" }}>
            {text}
          </span>
        )}
        {(reason || sources?.length) && (
          <div style={{ fontSize: "0.7rem", color: "var(--muted)", marginTop: "0.1rem" }}>
            {reason}
            {sources && sources.length > 0 && ` · from: ${sources.join("; ")}`}
          </div>
        )}
      </div>
      <span style={{ display: "flex", gap: "0.2rem" }}>
        <button type="button" className="btn" onClick={() => onDecide("accepted")} style={{ padding: "0.1rem 0.45rem", fontSize: "0.7rem", backgroundColor: decision === "accepted" ? color : undefined, color: decision === "accepted" ? "white" : undefined }}>
          ✓
        </button>
        <button type="button" className="btn" onClick={() => onDecide("rejected")} style={{ padding: "0.1rem 0.45rem", fontSize: "0.7rem" }}>
          ✕
        </button>
      </span>
    </div>
  );
}
