/**
 * Project feed storage in IndexedDB. Holds feed items (extracted text + AI triage)
 * and the original file blobs. Tasks stay in localStorage; this store is for the
 * larger, append-heavy intake data.
 */

import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export type FeedKind =
  | "text"
  | "teams"
  | "email"
  | "docx"
  | "xlsx"
  | "pdf"
  | "image"
  | "progress_report"
  | "registry_change";

export type FeedStatus = "new" | "triaged" | "covered" | "archived";
export type Court = "mine" | "theirs" | "team";

export interface FeedAction {
  title: string;
  owner: string | null;
  court: Court;
  due_at: string | null;
  follow_up_by: string | null;
  linked_task_id?: string;
}

export interface FeedTriage {
  summary: string;
  include_in_meeting: boolean;
  include_reason: string;
  agenda_section: string | null;
  topics: string[];
  decisions: string[];
  open_questions: string[];
  dates: Array<{ label: string; date: string }>;
  actions: FeedAction[];
  project_guess: string | null;
  triaged_at: string;
  model: string;
}

export interface FeedItem {
  id: string;
  project_id: string | null;
  project_name: string | null;
  project_confidence: "alias" | "ai" | "manual" | "none";
  kind: FeedKind;
  title: string;
  source_date: string | null;
  captured_at: string;
  text: string;
  file_ref: string | null;
  file_name: string | null;
  content_hash: string;
  parent_id: string | null;
  people: string[];
  triage: FeedTriage | null;
  triage_error: string | null;
  status: FeedStatus;
  covered_in_meeting: string | null;
}

export interface FeedBlob {
  id: string;
  name: string;
  type: string;
  size: number;
  blob: Blob;
  created_at: string;
}

/** Living agenda for a project: running outline that meeting prep edits by proposal. */
export interface AgendaBullet {
  id: string;
  text: string;
  depth: number; // 0 = top-level bullet under its section
  added_at: string; // ISO
  source_item_ids: string[];
  stale?: boolean;
}

export interface AgendaSection {
  id: string;
  heading: string;
  bullets: AgendaBullet[];
}

export interface AgendaSnapshot {
  meeting_id: string;
  date: string; // YYYY-MM-DD
  text: string; // plain-text outline at finalize time
  covered_item_ids: string[];
}

export interface LivingAgenda {
  project_id: string;
  sections: AgendaSection[];
  updated_at: string;
  last_meeting_at: string | null;
  snapshots: AgendaSnapshot[]; // newest first
}

interface TidyFeedDB extends DBSchema {
  agendas: {
    key: string;
    value: LivingAgenda;
  };
  feed_items: {
    key: string;
    value: FeedItem;
    indexes: {
      by_project: string;
      by_captured: string;
      by_hash: string;
      by_status: string;
    };
  };
  blobs: {
    key: string;
    value: FeedBlob;
  };
}

const DB_NAME = "tidy-feed";
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<TidyFeedDB>> | null = null;

function db(): Promise<IDBPDatabase<TidyFeedDB>> {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not available"));
  }
  if (!dbPromise) {
    dbPromise = openDB<TidyFeedDB>(DB_NAME, DB_VERSION, {
      upgrade(database, oldVersion) {
        if (oldVersion < 1) {
          const items = database.createObjectStore("feed_items", { keyPath: "id" });
          items.createIndex("by_project", "project_id");
          items.createIndex("by_captured", "captured_at");
          items.createIndex("by_hash", "content_hash");
          items.createIndex("by_status", "status");
          database.createObjectStore("blobs", { keyPath: "id" });
        }
        if (oldVersion < 2) {
          database.createObjectStore("agendas", { keyPath: "project_id" });
        }
      },
    });
  }
  return dbPromise;
}

export async function putFeedItem(item: FeedItem): Promise<void> {
  const d = await db();
  await d.put("feed_items", item);
}

export async function putFeedItems(items: FeedItem[]): Promise<void> {
  const d = await db();
  const tx = d.transaction("feed_items", "readwrite");
  await Promise.all([...items.map((i) => tx.store.put(i)), tx.done]);
}

export async function getFeedItem(id: string): Promise<FeedItem | undefined> {
  const d = await db();
  return d.get("feed_items", id);
}

export async function deleteFeedItem(id: string): Promise<void> {
  const d = await db();
  const item = await d.get("feed_items", id);
  await d.delete("feed_items", id);
  if (item?.file_ref) {
    // Remove the blob only if no other item references it
    const all = await d.getAll("feed_items");
    if (!all.some((i) => i.file_ref === item.file_ref)) await d.delete("blobs", item.file_ref);
  }
}

export async function updateFeedItem(id: string, patch: Partial<FeedItem>): Promise<FeedItem | undefined> {
  const d = await db();
  const cur = await d.get("feed_items", id);
  if (!cur) return undefined;
  const next = { ...cur, ...patch };
  await d.put("feed_items", next);
  return next;
}

export async function findByHash(hash: string): Promise<FeedItem | undefined> {
  const d = await db();
  return d.getFromIndex("feed_items", "by_hash", hash);
}

/** All items, newest captured first. */
export async function getAllFeedItems(): Promise<FeedItem[]> {
  const d = await db();
  const items = await d.getAllFromIndex("feed_items", "by_captured");
  return items.reverse();
}

export async function getFeedItemsForProject(projectId: string | null): Promise<FeedItem[]> {
  const d = await db();
  if (projectId === null) {
    const all = await d.getAllFromIndex("feed_items", "by_captured");
    return all.filter((i) => i.project_id === null).reverse();
  }
  const items = await d.getAllFromIndex("feed_items", "by_project", projectId);
  return items.sort((a, b) => (a.captured_at < b.captured_at ? 1 : -1));
}

export async function countFeedByStatus(): Promise<Record<FeedStatus, number>> {
  const d = await db();
  const all = await d.getAll("feed_items");
  const out: Record<FeedStatus, number> = { new: 0, triaged: 0, covered: 0, archived: 0 };
  for (const i of all) out[i.status]++;
  return out;
}

export async function putBlob(file: File | Blob, name: string): Promise<string> {
  const d = await db();
  const id = crypto.randomUUID();
  await d.put("blobs", {
    id,
    name,
    type: file.type || "application/octet-stream",
    size: file.size,
    blob: file,
    created_at: new Date().toISOString(),
  });
  return id;
}

export async function getBlob(id: string): Promise<FeedBlob | undefined> {
  const d = await db();
  return d.get("blobs", id);
}

export async function clearFeed(): Promise<void> {
  const d = await db();
  await Promise.all([d.clear("feed_items"), d.clear("blobs"), d.clear("agendas")]);
}

// ---------------------------------------------------------------------------
// Agendas
// ---------------------------------------------------------------------------

export async function getAgenda(projectId: string): Promise<LivingAgenda | undefined> {
  const d = await db();
  return d.get("agendas", projectId);
}

export async function putAgenda(agenda: LivingAgenda): Promise<void> {
  const d = await db();
  await d.put("agendas", { ...agenda, updated_at: new Date().toISOString() });
}

export async function getAllAgendas(): Promise<LivingAgenda[]> {
  const d = await db();
  return d.getAll("agendas");
}

export async function importAgendas(agendas: LivingAgenda[], mode: "append" | "replace"): Promise<number> {
  const d = await db();
  if (mode === "replace") await d.clear("agendas");
  const tx = d.transaction("agendas", "readwrite");
  let n = 0;
  for (const a of agendas) {
    if (mode === "append" && (await tx.store.get(a.project_id))) continue;
    await tx.store.put(a);
    n++;
  }
  await tx.done;
  return n;
}

/** Mark feed items as covered by a meeting. */
export async function markItemsCovered(ids: string[], meetingId: string): Promise<void> {
  const d = await db();
  const tx = d.transaction("feed_items", "readwrite");
  for (const id of ids) {
    const it = await tx.store.get(id);
    if (it) await tx.store.put({ ...it, status: "covered", covered_in_meeting: meetingId });
  }
  await tx.done;
}

/** Export-friendly snapshot (no blobs). */
export async function exportFeedItems(): Promise<FeedItem[]> {
  const d = await db();
  return d.getAll("feed_items");
}

export async function importFeedItems(items: FeedItem[], mode: "append" | "replace"): Promise<number> {
  const d = await db();
  if (mode === "replace") await d.clear("feed_items");
  const tx = d.transaction("feed_items", "readwrite");
  let added = 0;
  for (const item of items) {
    if (mode === "append") {
      const existing = await tx.store.get(item.id);
      if (existing) continue;
    }
    await tx.store.put({ ...item, file_ref: null });
    added++;
  }
  await tx.done;
  return added;
}
