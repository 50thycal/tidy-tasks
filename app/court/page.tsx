"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { buildCourtBoard, type CourtBoard, type CourtCard, type CourtColumn } from "@/src/lib/court";
import { ensureCourtFields, markItemDone, setTaskCourt, markNudged, type TaskCourt } from "@/src/lib/clientStore";
import { createTasksFromActions } from "@/src/lib/feedIngest";
import { getContacts, seedContactsFromRegistry, findContact } from "@/src/lib/contacts";
import { getWorkSettingsV2 } from "@/src/lib/settings";
import type { Contact } from "@/src/types";

export default function CourtPage() {
  const [board, setBoard] = useState<CourtBoard | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [nudge, setNudge] = useState<{ owner: string; column: CourtColumn } | null>(null);
  const [stale, setStale] = useState(5);

  const reload = async () => {
    ensureCourtFields();
    if (getContacts().length === 0) seedContactsFromRegistry();
    setContacts(getContacts());
    setBoard(await buildCourtBoard());
  };

  useEffect(() => {
    reload();
  }, []);

  if (!board) return <p style={{ color: "var(--muted)" }}>Loading…</p>;

  const columns = [board.mine, ...board.people, board.team].filter((c) => c.cards.length > 0 || c.key === "mine");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem", paddingBottom: "5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "0.5rem" }}>
        <div>
          <h1 style={{ marginBottom: "0.25rem", fontSize: "1.75rem" }}>Court</h1>
          <p style={{ color: "var(--muted)", fontSize: "0.85rem", margin: 0 }}>
            Who is holding what. {board.total_waiting} item{board.total_waiting === 1 ? "" : "s"} waiting on other people across {board.people.length} {board.people.length === 1 ? "person" : "people"}.
          </p>
        </div>
        <label style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
          Stale after{" "}
          <input className="input" type="number" min={1} value={stale} onChange={(e) => setStale(Math.max(1, Number(e.target.value) || 5))} style={{ width: "4rem", marginLeft: "0.25rem" }} /> days
        </label>
      </div>

      <div style={{ display: "flex", gap: "0.75rem", overflowX: "auto", paddingBottom: "0.5rem", alignItems: "flex-start" }}>
        {columns.map((col) => (
          <Column key={col.key} col={col} stale={stale} contacts={contacts} onNudge={() => setNudge({ owner: col.label, column: col })} onChange={reload} />
        ))}
      </div>

      {nudge && <NudgePanel owner={nudge.owner} column={nudge.column} onClose={() => setNudge(null)} onSent={reload} />}
    </div>
  );
}

function Column({ col, stale, contacts, onNudge, onChange }: { col: CourtColumn; stale: number; contacts: Contact[]; onNudge: () => void; onChange: () => void }) {
  const isPerson = col.key !== "mine" && col.key !== "team";
  const contact = isPerson ? findContact(col.label, contacts) : null;
  const staleCount = col.cards.filter((c) => c.days_waiting >= stale).length;
  return (
    <section className="card" style={{ minWidth: "300px", maxWidth: "340px", flex: "0 0 auto", padding: "0.75rem", display: "flex", flexDirection: "column", gap: "0.5rem", borderTop: `3px solid ${col.key === "mine" ? "var(--accent)" : col.overdue || staleCount ? "var(--warn)" : "var(--border)"}` }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
        <h2 style={{ fontSize: "1rem", margin: 0 }}>{col.label}</h2>
        <span style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
          {col.cards.length}
          {contact?.org ? ` · ${contact.org}` : ""}
          {col.oldest_days > 0 && ` · oldest ${col.oldest_days}d`}
        </span>
        {isPerson && (
          <button type="button" className="btn" style={{ marginLeft: "auto", padding: "0.2rem 0.55rem", fontSize: "0.72rem" }} onClick={onNudge}>
            Nudge
          </button>
        )}
      </div>
      {contact?.role && <div style={{ fontSize: "0.7rem", color: "var(--muted)", marginTop: "-0.3rem" }}>{contact.role}</div>}
      {col.cards.length === 0 ? (
        <div style={{ fontSize: "0.8rem", color: "var(--muted)", padding: "0.5rem 0" }}>Nothing here.</div>
      ) : (
        col.cards.map((c) => <Card key={c.key} card={c} stale={stale} contacts={contacts} onChange={onChange} />)
      )}
    </section>
  );
}

function Card({ card, stale, contacts, onChange }: { card: CourtCard; stale: number; contacts: Contact[]; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const isStale = card.court === "theirs" && card.days_waiting >= stale;
  const setOwner = (owner: string, court: TaskCourt) => {
    if (card.task) setTaskCourt(card.task.id, { owner: owner || null, court });
    setEditing(false);
    onChange();
  };
  return (
    <div style={{ padding: "0.5rem 0.6rem", borderRadius: "0.5rem", backgroundColor: "var(--panel-2)", border: `1px solid ${card.overdue ? "var(--danger)" : isStale ? "var(--warn)" : "var(--border)"}`, fontSize: "0.82rem", display: "flex", flexDirection: "column", gap: "0.3rem" }}>
      <div style={{ display: "flex", gap: "0.4rem", alignItems: "flex-start" }}>
        <span style={{ flex: 1 }}>{card.title}</span>
        {card.kind === "feed" && <span className="badge" style={{ fontSize: "0.6rem" }} title="From the feed, not yet a task">feed</span>}
      </div>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", fontSize: "0.7rem", color: "var(--muted)", alignItems: "center" }}>
        {card.project && <span>{card.project}</span>}
        {card.court === "theirs" && (
          <span style={{ color: isStale ? "var(--warn)" : "inherit", fontWeight: isStale ? 600 : 400 }}>
            {card.days_waiting}d waiting
          </span>
        )}
        {card.due && <span style={{ color: card.overdue ? "var(--danger)" : "inherit" }}>{card.overdue ? "overdue " : "by "}{card.due}</span>}
        {card.last_nudged_at && <span>nudged {card.last_nudged_at.slice(0, 10)}</span>}
      </div>
      {editing ? (
        <OwnerEditor initial={card.owner ?? ""} court={card.court} contacts={contacts} onSave={setOwner} onCancel={() => setEditing(false)} />
      ) : (
        <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
          {card.task && (
            <>
              <MiniBtn onClick={() => setEditing(true)}>Reassign</MiniBtn>
              {card.court === "theirs" ? (
                <MiniBtn onClick={() => { setTaskCourt(card.task!.id, { court: "mine" }); onChange(); }}>Got it back</MiniBtn>
              ) : (
                <MiniBtn onClick={() => setEditing(true)}>Hand off</MiniBtn>
              )}
              <MiniBtn onClick={async () => { await markItemDone(card.task!.id); onChange(); }}>Done</MiniBtn>
              {card.court === "theirs" && <MiniBtn onClick={() => { markNudged(card.task!.id); onChange(); }}>Nudged</MiniBtn>}
            </>
          )}
          {card.feed && (
            <MiniBtn
              onClick={async () => {
                await createTasksFromActions(card.feed!.item, [card.feed!.index]);
                onChange();
              }}
            >
              Make task
            </MiniBtn>
          )}
        </div>
      )}
    </div>
  );
}

function OwnerEditor({ initial, court, contacts, onSave, onCancel }: { initial: string; court: TaskCourt; contacts: Contact[]; onSave: (owner: string, court: TaskCourt) => void; onCancel: () => void }) {
  const [owner, setOwner] = useState(initial);
  const [c, setC] = useState<TaskCourt>(court === "mine" ? "theirs" : court);
  return (
    <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", alignItems: "center" }}>
      <input className="input" list="court-contacts" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Who" style={{ flex: 1, minWidth: "100px", fontSize: "0.75rem", padding: "0.2rem 0.4rem" }} autoFocus />
      <datalist id="court-contacts">
        {contacts.map((ct) => (
          <option key={ct.id} value={ct.name} />
        ))}
      </datalist>
      <select className="input" value={c} onChange={(e) => setC(e.target.value as TaskCourt)} style={{ fontSize: "0.75rem", padding: "0.2rem 0.4rem", width: "auto" }}>
        <option value="theirs">Waiting on them</option>
        <option value="mine">Mine</option>
        <option value="team">Team</option>
      </select>
      <MiniBtn onClick={() => onSave(owner.trim(), c)}>Save</MiniBtn>
      <MiniBtn onClick={onCancel}>Cancel</MiniBtn>
    </div>
  );
}

function MiniBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className="btn" onClick={onClick} style={{ padding: "0.15rem 0.45rem", fontSize: "0.68rem" }}>
      {children}
    </button>
  );
}

function NudgePanel({ owner, column, onClose, onSent }: { owner: string; column: CourtColumn; onClose: () => void; onSent: () => void }) {
  const [channel, setChannel] = useState<"teams" | "email">("teams");
  const [tone, setTone] = useState<"friendly" | "firm">(column.overdue > 0 ? "firm" : "friendly");
  const [selected, setSelected] = useState<Set<string>>(new Set(column.cards.map((c) => c.key)));
  const [draft, setDraft] = useState<{ message: string; subject: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const items = column.cards.filter((c) => selected.has(c.key));
      const project = Array.from(new Set(items.map((i) => i.project).filter(Boolean))).join(", ") || null;
      const res = await fetch("/api/ai/draft_nudge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner,
          channel,
          tone,
          project,
          my_name: getWorkSettingsV2().my_last_name ?? null,
          items: items.map((i) => ({ title: i.title, since: i.since?.slice(0, 10) ?? null, due: i.due, context: i.feed?.item.triage?.summary ?? i.task?.result.notes_append ?? null })),
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      setDraft(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!draft) return;
    const text = draft.subject ? `Subject: ${draft.subject}\n\n${draft.message}` : draft.message;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Copy:", text);
    }
    for (const c of column.cards) if (selected.has(c.key) && c.task) markNudged(c.task.id);
    onSent();
  };

  return (
    <div role="dialog" onClick={(e) => e.target === e.currentTarget && onClose()} style={{ position: "fixed", inset: 0, zIndex: 1600, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "4rem 1rem" }}>
      <div className="card" style={{ width: "min(640px, 100%)", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Nudge {owner}</h2>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", fontSize: "0.8rem" }}>
          <select className="input" value={channel} onChange={(e) => setChannel(e.target.value as any)} style={{ width: "auto" }}>
            <option value="teams">Teams message</option>
            <option value="email">Email</option>
          </select>
          <select className="input" value={tone} onChange={(e) => setTone(e.target.value as any)} style={{ width: "auto" }}>
            <option value="friendly">Friendly</option>
            <option value="firm">Firm</option>
          </select>
          <button type="button" className="btn btn-primary" onClick={generate} disabled={busy || selected.size === 0} style={{ marginLeft: "auto" }}>
            {busy ? "Drafting…" : draft ? "Redraft" : "Draft"}
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.8rem", maxHeight: "180px", overflow: "auto" }}>
          {column.cards.map((c) => (
            <label key={c.key} style={{ display: "flex", gap: "0.4rem", alignItems: "flex-start" }}>
              <input type="checkbox" checked={selected.has(c.key)} onChange={(e) => { const n = new Set(selected); e.target.checked ? n.add(c.key) : n.delete(c.key); setSelected(n); }} />
              <span>
                {c.title} <span style={{ color: "var(--muted)" }}>· {c.days_waiting}d{c.due ? ` · by ${c.due}` : ""}</span>
              </span>
            </label>
          ))}
        </div>
        {error && <div style={{ color: "var(--danger)", fontSize: "0.8rem" }}>{error}</div>}
        {draft && (
          <>
            {draft.subject && <input className="input" value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />}
            <textarea className="textarea" value={draft.message} onChange={(e) => setDraft({ ...draft, message: e.target.value })} style={{ minHeight: "140px", fontSize: "0.88rem" }} />
          </>
        )}
        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
          <button type="button" className="btn btn-success" onClick={copy} disabled={!draft}>
            {copied ? "Copied" : "Copy & mark nudged"}
          </button>
        </div>
      </div>
    </div>
  );
}
