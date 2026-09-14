"use client";

import { useEffect, useState } from "react";
import type { Contact } from "@/src/types";
import { getContacts, upsertContact, deleteContact, saveContacts, seedContactsFromRegistry } from "@/src/lib/contacts";

const ORGS: Contact["org"][] = ["BMcD", "ITC", "Vendor", "Other"];

export default function ContactsTable() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [draft, setDraft] = useState({ name: "", org: "ITC" as Contact["org"], role: "", projects: "", aliases: "" });
  const [filter, setFilter] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const reload = () => setContacts(getContacts());
  useEffect(() => {
    reload();
  }, []);

  const add = () => {
    if (!draft.name.trim()) return;
    upsertContact({
      name: draft.name,
      org: draft.org,
      role: draft.role || undefined,
      projects: draft.projects.split(",").map((s) => s.trim()).filter(Boolean),
      aliases: draft.aliases.split(",").map((s) => s.trim()).filter(Boolean),
      source: "manual",
    });
    setDraft({ name: "", org: "ITC", role: "", projects: "", aliases: "" });
    reload();
  };

  const update = (id: string, patch: Partial<Contact>) => {
    saveContacts(contacts.map((c) => (c.id === id ? { ...c, ...patch, updated_at: new Date().toISOString() } : c)));
    reload();
  };

  const seed = () => {
    const n = seedContactsFromRegistry();
    setMsg(`${n} contact${n === 1 ? "" : "s"} added from the progress report.`);
    reload();
  };

  const visible = contacts.filter((c) => !filter || [c.name, c.role, ...c.projects, ...c.aliases].join(" ").toLowerCase().includes(filter.toLowerCase()));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: 0 }}>
        People you exchange work with. Names here are used to spell owners consistently and to route tasks to the right person in the Court view.
      </p>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
        <input className="input" placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: "200px" }} />
        <button type="button" className="btn" onClick={seed}>
          Seed from progress report
        </button>
        {msg && <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>{msg}</span>}
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--muted)" }}>
              <th style={{ padding: "0.3rem" }}>Name</th>
              <th style={{ padding: "0.3rem" }}>Org</th>
              <th style={{ padding: "0.3rem" }}>Role</th>
              <th style={{ padding: "0.3rem" }}>Projects</th>
              <th style={{ padding: "0.3rem" }}>Aliases</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visible.map((c) => (
              <tr key={c.id} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={{ padding: "0.3rem" }}>
                  <input className="input" value={c.name} onChange={(e) => update(c.id, { name: e.target.value })} style={{ fontSize: "0.8rem", padding: "0.2rem 0.4rem", width: "140px" }} />
                </td>
                <td style={{ padding: "0.3rem" }}>
                  <select className="input" value={c.org} onChange={(e) => update(c.id, { org: e.target.value as Contact["org"] })} style={{ fontSize: "0.8rem", padding: "0.2rem 0.4rem", width: "auto" }}>
                    {ORGS.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </td>
                <td style={{ padding: "0.3rem" }}>
                  <input className="input" value={c.role ?? ""} onChange={(e) => update(c.id, { role: e.target.value })} style={{ fontSize: "0.8rem", padding: "0.2rem 0.4rem", width: "160px" }} />
                </td>
                <td style={{ padding: "0.3rem", color: "var(--muted)" }}>{c.projects.join(", ")}</td>
                <td style={{ padding: "0.3rem" }}>
                  <input className="input" value={c.aliases.join(", ")} onChange={(e) => update(c.id, { aliases: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} placeholder="Full name, nickname" style={{ fontSize: "0.8rem", padding: "0.2rem 0.4rem", width: "160px" }} />
                </td>
                <td style={{ padding: "0.3rem" }}>
                  <button type="button" className="btn btn-danger" onClick={() => { deleteContact(c.id); reload(); }} style={{ padding: "0.15rem 0.45rem", fontSize: "0.7rem" }}>
                    ×
                  </button>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: "0.75rem", color: "var(--muted)" }}>
                  No contacts yet. Seed from the progress report or add one below.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
        <input className="input" placeholder="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} style={{ width: "140px" }} />
        <select className="input" value={draft.org} onChange={(e) => setDraft({ ...draft, org: e.target.value as Contact["org"] })} style={{ width: "auto" }}>
          {ORGS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <input className="input" placeholder="Role" value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} style={{ width: "150px" }} />
        <input className="input" placeholder="Projects (comma)" value={draft.projects} onChange={(e) => setDraft({ ...draft, projects: e.target.value })} style={{ width: "160px" }} />
        <input className="input" placeholder="Aliases (comma)" value={draft.aliases} onChange={(e) => setDraft({ ...draft, aliases: e.target.value })} style={{ width: "160px" }} />
        <button type="button" className="btn btn-primary" onClick={add} disabled={!draft.name.trim()}>
          Add
        </button>
      </div>
    </div>
  );
}
