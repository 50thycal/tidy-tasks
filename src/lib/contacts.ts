/**
 * Contacts registry: people you exchange work with. Lives in settings
 * (small, synchronous). Seeded from the progress report's ITC and BMcD
 * columns, grown from task and feed owners, editable in Settings.
 */

import type { Contact } from "@/src/types";
import { getStoredSettings, saveSettings, getDefaultWorkSettingsV2 } from "./settings";
import { getFollowedProjects, projectPeople } from "./registry";

export function getContacts(): Contact[] {
  if (typeof window === "undefined") return [];
  return getStoredSettings()?.work.contacts ?? [];
}

export function saveContacts(contacts: Contact[]): void {
  if (typeof window === "undefined") return;
  const stored = getStoredSettings();
  const settings = stored ?? { version: 2 as const, work: getDefaultWorkSettingsV2() };
  settings.work.contacts = contacts;
  saveSettings(settings);
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Find a contact by name or alias. Last-name-only matches are accepted. */
export function findContact(name: string | null | undefined, contacts: Contact[] = getContacts()): Contact | null {
  if (!name) return null;
  const n = norm(name).replace(/<.*>/, "").trim();
  if (!n) return null;
  for (const c of contacts) {
    if (norm(c.name) === n || c.aliases.some((a) => norm(a) === n)) return c;
  }
  // "Josh Nickell" matches contact "Nickell" or "Josh"; "Lake" matches "Lake Ashcroft"
  const tokens = n.split(" ");
  for (const c of contacts) {
    const ct = norm(c.name).split(" ");
    if (tokens.some((t) => t.length >= 3 && ct.includes(t))) return c;
    if (c.aliases.some((a) => norm(a).split(" ").some((t) => t.length >= 3 && tokens.includes(t)))) return c;
  }
  return null;
}

/** Canonical display name for an owner string, if it maps to a known contact. */
export function canonicalOwner(name: string | null | undefined): string | null {
  if (!name) return null;
  const c = findContact(name);
  return c ? c.name : name.trim();
}

export function upsertContact(input: Partial<Contact> & { name: string }): Contact {
  const contacts = getContacts();
  const existing = findContact(input.name, contacts);
  const now = new Date().toISOString();
  if (existing) {
    const merged: Contact = {
      ...existing,
      ...input,
      id: existing.id,
      name: existing.name,
      projects: Array.from(new Set([...(existing.projects ?? []), ...(input.projects ?? [])])),
      aliases: Array.from(new Set([...(existing.aliases ?? []), ...(input.aliases ?? [])])),
      role: input.role ?? existing.role,
      updated_at: now,
    };
    saveContacts(contacts.map((c) => (c.id === existing.id ? merged : c)));
    return merged;
  }
  const c: Contact = {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    org: input.org ?? "Other",
    role: input.role,
    projects: input.projects ?? [],
    aliases: input.aliases ?? [],
    notes: input.notes,
    source: input.source ?? "manual",
    updated_at: now,
  };
  saveContacts([...contacts, c]);
  return c;
}

export function deleteContact(id: string): void {
  saveContacts(getContacts().filter((c) => c.id !== id));
}

/** Seed or refresh contacts from the registry's followed projects. Returns number added. */
export function seedContactsFromRegistry(): number {
  const before = getContacts().length;
  for (const p of getFollowedProjects()) {
    for (const person of projectPeople(p)) {
      upsertContact({ name: person.name, org: person.org, role: person.role, projects: [p.name], source: "registry" });
    }
  }
  return getContacts().length - before;
}

/** Compact list for AI prompts: "Lake (ITC Project Lead, Cannoli)". */
export function contactsForPrompt(limit = 80): string[] {
  return getContacts()
    .slice(0, limit)
    .map((c) => `${c.name}${c.org ? ` [${c.org}]` : ""}${c.role ? ` ${c.role}` : ""}${c.projects.length ? ` (${c.projects.slice(0, 3).join(", ")})` : ""}`);
}

// ---------------------------------------------------------------------------
// Owner inference from task text (no AI)
// ---------------------------------------------------------------------------

const THEIRS_RE = [
  /\b(?:waiting|wait)\s+(?:on|for)\s+([A-Z][\w'.-]+(?:\s+[A-Z][\w'.-]+)?)/,
  /\b(?:follow\s*up|check\s*in|circle\s*back)\s+with\s+([A-Z][\w'.-]+(?:\s+[A-Z][\w'.-]+)?)/i,
  /\b(?:ask|ping|remind|nudge|poke)\s+([A-Z][\w'.-]+(?:\s+[A-Z][\w'.-]+)?)/,
  /\b(?:need|needs|get|pending)\s+(?:an?\s+)?(?:answer|response|reply|confirmation|input|cutsheets?|drawings?|info(?:rmation)?)\s+from\s+([A-Z][\w'.-]+(?:\s+[A-Z][\w'.-]+)?)/i,
  /^([A-Z][\w'.-]+(?:\s+[A-Z][\w'.-]+)?)\s+to\s+(?:send|provide|confirm|review|follow|update|get|check|verify)/,
];
const MINE_RE = [
  /\b(?:send|email|call|talk\s+to|reach\s+out\s+to|coordinate\s+with|setup|set\s+up|schedule)\s+(?:a\s+\w+\s+)?(?:with\s+|to\s+)?([A-Z][\w'.-]+(?:\s+[A-Z][\w'.-]+)?)/,
];
const NOT_NAMES = new Set(["itc", "bmcd", "the", "team", "client", "vendor", "planning", "q3", "q4", "q6"]);

export interface OwnerGuess {
  owner: string;
  court: "mine" | "theirs";
  contact: Contact | null;
}

const LOOSE_THEIRS_RE = [/\b(?:from|with|on)\s+([A-Z][\w'.-]+(?:\s+[A-Z][\w'.-]+)?)\b/];

/**
 * Guess the person a task is with and which court it is in from its text.
 * When `assumeTheirs` is set (the task is already known to be waiting on someone),
 * a looser "from/with/on NAME" rule is also tried.
 */
export function inferOwner(text: string, contacts: Contact[] = getContacts(), assumeTheirs = false): OwnerGuess | null {
  const t = text.replace(/\s+/g, " ").trim();
  const tryMatch = (res: RegExp[], court: "mine" | "theirs"): OwnerGuess | null => {
    for (const re of res) {
      const m = t.match(re);
      if (!m) continue;
      const raw = m[1].replace(/[.,;:]+$/, "");
      if (NOT_NAMES.has(raw.toLowerCase())) {
        if (/^itc$/i.test(raw)) return { owner: "ITC", court, contact: null };
        continue;
      }
      const c = findContact(raw, contacts);
      return { owner: c ? c.name : raw, court, contact: c };
    }
    return null;
  };
  return tryMatch(THEIRS_RE, "theirs") ?? tryMatch(MINE_RE, "mine") ?? (assumeTheirs ? tryMatch(LOOSE_THEIRS_RE, "theirs") : null);
}
