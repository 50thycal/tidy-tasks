/**
 * Ingest anything (file, pasted text, image) into the project feed.
 * Routes by type, parses locally, dedupes by content hash, stores in IndexedDB,
 * then runs AI triage in the background.
 */

import {
  putFeedItem,
  putFeedItems,
  findByHash,
  putBlob,
  updateFeedItem,
  getAgenda,
  type FeedItem,
  type FeedKind,
  type FeedTriage,
  type FeedAction,
} from "./feedStore";
import { parseEmailFile, isSupportedEmailFile } from "./emailParser";
import { parseProgressReport, sniffProgressReport } from "./progressReportImporter";
import {
  getRegistry,
  saveRegistry,
  mergeImport,
  getFollowedProjects,
  getProjects,
  getProjectById,
  projectPeople,
  nextMilestone,
  type Project,
  type RegistryChange,
} from "./registry";
import { syncRegistryToSettings } from "./registrySync";
import {
  sha256,
  hashArrayBuffer,
  normalizeForHash,
  sniffDate,
  sniffEmailHeaderDate,
  parseTeamsThread,
  looksLikeTeams,
  splitEmailChain,
  looksLikeEmail,
  detectProject,
  sniffPeople,
  firstLineTitle,
} from "./textParsers";
import { getWorkSettingsV2 } from "./settings";
import { getContacts, canonicalOwner, contactsForPrompt } from "./contacts";
import { bulkAddInboxItems, type InboxItem } from "./clientStore";
import type { CleanTaskRequest, CleanTaskResponse } from "@/src/types";

export interface IngestOptions {
  projectId?: string | null; // force a project
  sourceDate?: string | null;
  triage?: boolean; // default true
}

export interface IngestResult {
  items: FeedItem[];
  duplicates: number;
  registryImport?: { projects: number; mine: number; changes: RegistryChange[]; warnings: string[]; leads: string[] };
  errors: string[];
}

function nowIso() {
  return new Date().toISOString();
}

function baseItem(partial: Partial<FeedItem> & { kind: FeedKind; text: string; content_hash: string }): FeedItem {
  return {
    id: crypto.randomUUID(),
    project_id: null,
    project_name: null,
    project_confidence: "none",
    title: firstLineTitle(partial.text),
    source_date: null,
    captured_at: nowIso(),
    file_ref: null,
    file_name: null,
    parent_id: null,
    people: [],
    triage: null,
    triage_error: null,
    status: "new",
    covered_in_meeting: null,
    ...partial,
  };
}

function assignProject(item: FeedItem, forced: string | null | undefined): FeedItem {
  if (forced) {
    const p = getProjectById(forced);
    if (p) return { ...item, project_id: p.id, project_name: p.name, project_confidence: "manual" };
  }
  const match = detectProject(`${item.title}\n${item.text}`, getProjects());
  if (match) return { ...item, project_id: match.project.id, project_name: match.project.name, project_confidence: "alias" };
  return item;
}

/** Names that are never people: project and substation names, and their aliases. */
function projectNameReject(): string[] {
  const out = new Set<string>();
  for (const p of getProjects()) {
    out.add(p.name);
    out.add(p.substation);
    for (const a of p.aliases) out.add(a);
  }
  return Array.from(out);
}

function knownPeople(): string[] {
  const set = new Set<string>();
  for (const c of getContacts()) {
    set.add(c.name);
    for (const a of c.aliases) set.add(a);
  }
  for (const p of getFollowedProjects()) for (const person of projectPeople(p)) set.add(person.name);
  return Array.from(set);
}

// ---------------------------------------------------------------------------
// Text ingestion
// ---------------------------------------------------------------------------

export async function ingestText(raw: string, opts: IngestOptions = {}): Promise<IngestResult> {
  const text = raw.replace(/\r\n/g, "\n").trim();
  const result: IngestResult = { items: [], duplicates: 0, errors: [] };
  if (!text) return result;

  const hash = await sha256(normalizeForHash(text));
  const dup = await findByHash(hash);
  if (dup) {
    result.duplicates = 1;
    return result;
  }

  const people = knownPeople();
  let items: FeedItem[] = [];

  if (looksLikeEmail(text)) {
    const parts = splitEmailChain(text);
    if (parts.length > 1) {
      const parent = baseItem({
        kind: "email",
        text,
        content_hash: hash,
        title: parts[0].subject ?? firstLineTitle(parts[0].body),
        source_date: parts[0].when ?? opts.sourceDate ?? null,
        people: sniffPeople(text, people, { isEmail: true, reject: projectNameReject() }),
      });
      items.push(parent);
      for (const part of parts) {
        const childHash = await sha256(normalizeForHash(`${part.from ?? ""}|${part.when ?? ""}|${part.body}`));
        if (await findByHash(childHash)) {
          result.duplicates++;
          continue;
        }
        const childText = [
          part.from ? `From: ${part.from}` : null,
          part.to ? `To: ${part.to}` : null,
          part.when ? `Date: ${part.when}` : null,
          part.subject ? `Subject: ${part.subject}` : null,
          "",
          part.body,
        ]
          .filter((x): x is string => x !== null)
          .join("\n");
        items.push(
          baseItem({
            kind: "email",
            text: childText,
            content_hash: childHash,
            title: `${part.from ? part.from.replace(/<.*>/, "").trim() + ": " : ""}${part.subject ?? firstLineTitle(part.body, 60)}`,
            source_date: part.when ?? opts.sourceDate ?? null,
            parent_id: parent.id,
            people: sniffPeople(childText, people, { isEmail: true, reject: projectNameReject() }),
          })
        );
      }
    } else {
      const p = parts[0];
      items.push(
        baseItem({
          kind: "email",
          text,
          content_hash: hash,
          title: p?.subject ?? firstLineTitle(text),
          source_date: p?.when ?? sniffEmailHeaderDate(text) ?? opts.sourceDate ?? null,
          people: sniffPeople(text, people, { isEmail: true, reject: projectNameReject() }),
        })
      );
    }
  } else if (looksLikeTeams(text)) {
    const msgs = parseTeamsThread(text);
    const parent = baseItem({
      kind: "teams",
      text,
      content_hash: hash,
      title: `Teams: ${firstLineTitle(msgs[0]?.text ?? text, 70)}`,
      source_date: msgs.find((m) => m.when)?.when ?? opts.sourceDate ?? null,
      people: Array.from(new Set([...(msgs.map((m) => m.author).filter(Boolean) as string[]), ...sniffPeople(text, people, { reject: projectNameReject() })])),
    });
    items.push(parent);
  } else {
    items.push(
      baseItem({
        kind: "text",
        text,
        content_hash: hash,
        source_date: opts.sourceDate ?? sniffDate(text.slice(0, 300)) ?? nowIso().slice(0, 10),
        people: sniffPeople(text, people, { reject: projectNameReject() }),
      })
    );
  }

  // Project: the parent decides for the chain so children inherit it
  items = items.map((i) => assignProject(i, opts.projectId));
  if (items.length > 1 && items[0].project_id) {
    items = items.map((i) => (i.project_id ? i : { ...i, project_id: items[0].project_id, project_name: items[0].project_name, project_confidence: items[0].project_confidence }));
  }

  await putFeedItems(items);
  result.items = items;
  emitChanged();

  if (opts.triage !== false) {
    // Triage children of a chain (they are the real messages), or the single item
    const targets = items.length > 1 ? items.filter((i) => i.parent_id) : items;
    void triageItems(targets);
  }
  return result;
}

// ---------------------------------------------------------------------------
// File ingestion
// ---------------------------------------------------------------------------

const TEXT_EXT = [".txt", ".md", ".csv", ".log"];
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export async function ingestFile(file: File, opts: IngestOptions = {}): Promise<IngestResult> {
  const name = file.name.toLowerCase();
  const result: IngestResult = { items: [], duplicates: 0, errors: [] };

  try {
    if (name.endsWith(".xlsm") || name.endsWith(".xlsx")) {
      const buf = await file.arrayBuffer();
      if (await sniffProgressReport(buf)) return importProgressReportBuffer(buf, file, opts);
      // Other spreadsheets: Phase 4 (RFI log / change log). Store the blob and a stub.
      const hash = await hashArrayBuffer(buf);
      if (await findByHash(hash)) return { ...result, duplicates: 1 };
      const ref = await putBlob(file, file.name);
      const item = assignProject(
        baseItem({
          kind: "xlsx",
          text: `Spreadsheet "${file.name}" (${Math.round(file.size / 1024)} KB). Row-level import for this sheet type is not available yet.`,
          content_hash: hash,
          title: file.name,
          file_ref: ref,
          file_name: file.name,
          source_date: opts.sourceDate ?? nowIso().slice(0, 10),
        }),
        opts.projectId
      );
      await putFeedItem(item);
      result.items.push(item);
      emitChanged();
      return result;
    }

    if (isSupportedEmailFile(file) && !TEXT_EXT.some((e) => name.endsWith(e))) {
      const text = await parseEmailFile(file);
      const r = await ingestText(text, { ...opts, sourceDate: opts.sourceDate ?? sniffEmailHeaderDate(text) });
      // Keep the original file for .msg/.eml
      if (r.items.length) {
        const ref = await putBlob(file, file.name);
        await updateFeedItem(r.items[0].id, { file_ref: ref, file_name: file.name });
        r.items[0] = { ...r.items[0], file_ref: ref, file_name: file.name };
      }
      return r;
    }

    if (TEXT_EXT.some((e) => name.endsWith(e)) || file.type.startsWith("text/")) {
      const text = await file.text();
      return ingestText(text, opts);
    }

    if (IMAGE_TYPES.includes(file.type)) {
      const buf = await file.arrayBuffer();
      const hash = await hashArrayBuffer(buf);
      if (await findByHash(hash)) return { ...result, duplicates: 1 };
      const ref = await putBlob(file, file.name);
      const item = assignProject(
        baseItem({
          kind: "image",
          text: "",
          content_hash: hash,
          title: file.name || "Pasted image",
          file_ref: ref,
          file_name: file.name || "image.png",
          source_date: opts.sourceDate ?? nowIso().slice(0, 10),
        }),
        opts.projectId
      );
      await putFeedItem(item);
      result.items.push(item);
      emitChanged();
      if (opts.triage !== false) void triageItems([item]);
      return result;
    }

    if (name.endsWith(".docx") || name.endsWith(".pdf")) {
      // Parsers land in Phase 4. Store the blob so nothing is lost.
      const buf = await file.arrayBuffer();
      const hash = await hashArrayBuffer(buf);
      if (await findByHash(hash)) return { ...result, duplicates: 1 };
      const ref = await putBlob(file, file.name);
      const item = assignProject(
        baseItem({
          kind: name.endsWith(".pdf") ? "pdf" : "docx",
          text: `Document "${file.name}" stored. Text extraction for this type is not available yet; paste the relevant text to triage it.`,
          content_hash: hash,
          title: file.name,
          file_ref: ref,
          file_name: file.name,
          source_date: opts.sourceDate ?? nowIso().slice(0, 10),
        }),
        opts.projectId
      );
      await putFeedItem(item);
      result.items.push(item);
      emitChanged();
      return result;
    }

    result.errors.push(`Unsupported file type: ${file.name}`);
    return result;
  } catch (e) {
    result.errors.push(`${file.name}: ${e instanceof Error ? e.message : String(e)}`);
    return result;
  }
}

export async function ingestFiles(files: File[], opts: IngestOptions = {}): Promise<IngestResult> {
  const merged: IngestResult = { items: [], duplicates: 0, errors: [] };
  for (const f of files) {
    const r = await ingestFile(f, opts);
    merged.items.push(...r.items);
    merged.duplicates += r.duplicates;
    merged.errors.push(...r.errors);
    if (r.registryImport) merged.registryImport = r.registryImport;
  }
  return merged;
}

// ---------------------------------------------------------------------------
// Progress report
// ---------------------------------------------------------------------------

export async function importProgressReportBuffer(buf: ArrayBuffer, file: File, opts: IngestOptions = {}): Promise<IngestResult> {
  const result: IngestResult = { items: [], duplicates: 0, errors: [] };
  const hash = await hashArrayBuffer(buf);
  const current = getRegistry();
  if (current.imports[0]?.file_hash === hash) {
    result.duplicates = 1;
    result.registryImport = { projects: current.projects.length, mine: current.projects.filter((p) => p.mine).length, changes: [], warnings: ["This exact file was already imported."], leads: [] };
    return result;
  }

  const parsed = parseProgressReport(buf, file.name);
  const settings = getWorkSettingsV2();
  const merged = mergeImport(current, parsed.work_orders, {
    issue_date: parsed.issue_date,
    file_name: file.name,
    file_hash: hash,
    my_last_name: settings.my_last_name ?? null,
  });
  saveRegistry(merged.doc);
  syncRegistryToSettings();

  // Change items for followed projects only
  const followed = merged.doc.projects.filter((p) => p.mine || p.pinned);
  const woToProject = new Map<string, Project>();
  for (const p of followed) for (const w of p.work_orders) woToProject.set(w.wo, p);

  const byProject = new Map<string, RegistryChange[]>();
  for (const c of merged.importRecord.changes) {
    const p = woToProject.get(c.wo);
    if (!p) continue;
    if (!byProject.has(p.id)) byProject.set(p.id, []);
    byProject.get(p.id)!.push(c);
  }

  const items: FeedItem[] = [];
  const issue = parsed.issue_date ?? nowIso().slice(0, 10);
  byProject.forEach((changes, pid) => {
    const p = merged.doc.projects.find((x) => x.id === pid)!;
    const lines = changes.map((c) => `- ${c.wo} ${humanField(c.field)}: ${c.from ?? "—"} → ${c.to ?? "—"}`);
    const text = `Progress report issued ${issue} changed ${changes.length} item(s) for ${p.name}:\n${lines.join("\n")}`;
    items.push({
      ...baseItem({ kind: "registry_change", text, content_hash: `${hash}:${pid}` }),
      project_id: p.id,
      project_name: p.name,
      project_confidence: "manual",
      title: `Progress report ${issue}: ${changes.length} change${changes.length === 1 ? "" : "s"} for ${p.name}`,
      source_date: issue,
      file_name: file.name,
    });
  });
  if (items.length) {
    await putFeedItems(items);
    emitChanged();
    if (opts.triage !== false) void triageItems(items);
  }

  result.items = items;
  result.registryImport = {
    projects: merged.doc.projects.length,
    mine: merged.mine.length,
    changes: merged.importRecord.changes,
    warnings: parsed.warnings,
    leads: parsed.leads,
  };
  return result;
}

function humanField(f: string): string {
  if (f.startsWith("milestone:")) {
    const [, label, part] = f.split(":");
    return `${label}${part ? ` ${part}` : ""}`;
  }
  return f.replace(/_/g, " ");
}

// ---------------------------------------------------------------------------
// Triage
// ---------------------------------------------------------------------------

type Listener = (item: FeedItem) => void;
const listeners = new Set<Listener>();

// ---------------------------------------------------------------------------
// Triage progress (in-memory: what is queued and what is in flight right now)
// ---------------------------------------------------------------------------

export type TriagePhase = "queued" | "running";

export interface TriageProgressEntry {
  id: string;
  phase: TriagePhase;
  /** epoch ms the item entered this phase, for a live elapsed counter */
  since: number;
}

/** Fires whenever items are added or removed, so open pages can re-read the store. */
const changeListeners = new Set<() => void>();

export function onFeedChanged(fn: () => void): () => void {
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
}

function emitChanged() {
  changeListeners.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      console.error(e);
    }
  });
}

const triageProgress = new Map<string, TriageProgressEntry>();
const progressListeners = new Set<() => void>();

/** Subscribe to queue/in-flight changes. Returns unsubscribe. */
export function onTriageProgress(fn: () => void): () => void {
  progressListeners.add(fn);
  return () => progressListeners.delete(fn);
}

function emitProgress() {
  progressListeners.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      console.error(e);
    }
  });
}

function setPhase(id: string, phase: TriagePhase | null) {
  if (phase === null) triageProgress.delete(id);
  else triageProgress.set(id, { id, phase, since: Date.now() });
  emitProgress();
}

export function getTriagePhase(id: string): TriageProgressEntry | undefined {
  return triageProgress.get(id);
}

/** How many items are waiting and how many are being triaged right now. */
export function triageQueue(): { queued: number; running: number; total: number } {
  let queued = 0;
  let running = 0;
  triageProgress.forEach((e) => (e.phase === "running" ? running++ : queued++));
  return { queued, running, total: queued + running };
}

/** Subscribe to feed item updates (triage completion). Returns unsubscribe. */
export function onFeedItemUpdated(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(item: FeedItem) {
  listeners.forEach((fn) => {
    try {
      fn(item);
    } catch (e) {
      console.error(e);
    }
  });
}

async function blobToDataUrl(ref: string): Promise<string | null> {
  const { getBlob } = await import("./feedStore");
  const b = await getBlob(ref);
  if (!b) return null;
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => resolve(null);
    r.readAsDataURL(b.blob);
  });
}

export async function triageItem(item: FeedItem): Promise<FeedItem> {
  setPhase(item.id, "running");
  const settings = getWorkSettingsV2();
  const project = item.project_id ? getProjectById(item.project_id) : null;
  const people = knownPeople();
  const candidates = getFollowedProjects().map((p) => p.name);

  const body: Record<string, unknown> = {
    text: item.text,
    kind: item.kind,
    title: item.title,
    source_date: item.source_date,
    today: nowIso().slice(0, 10),
    timezone: settings.timezone,
    project: project
      ? {
          name: project.name,
          aliases: project.aliases,
          work_orders: project.work_orders.map((w) => `${w.wo} ${w.description}`),
          people: projectPeople(project).map((p) => `${p.name} (${p.role})`),
          next_milestone: (() => {
            const nm = nextMilestone(project);
            return nm ? `${nm.label} ${nm.date ?? "TBD"}` : null;
          })(),
        }
      : null,
    candidate_projects: candidates,
    agenda_sections: project ? ((await getAgenda(project.id).catch(() => undefined))?.sections.map((s) => s.heading) ?? []) : [],
    known_people: contactsForPrompt().length ? contactsForPrompt() : people,
    my_name: settings.my_last_name ?? null,
  };
  if (item.kind === "image" && item.file_ref) body.image_data_url = await blobToDataUrl(item.file_ref);

  try {
    const res = await fetch("/api/ai/triage_item", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = (await res.json()) as Omit<FeedTriage, "triaged_at">;
    const triage: FeedTriage = { ...data, triaged_at: nowIso() };

    const patch: Partial<FeedItem> = { triage, triage_error: null, status: item.status === "new" ? "triaged" : item.status };
    // Adopt the AI's project guess when nothing matched locally
    if (!item.project_id && triage.project_guess) {
      const p = getProjects().find((x) => x.name.toLowerCase() === triage.project_guess!.toLowerCase());
      if (p) Object.assign(patch, { project_id: p.id, project_name: p.name, project_confidence: "ai" });
    }
    const updated = (await updateFeedItem(item.id, patch)) ?? { ...item, ...patch };
    emit(updated);
    return updated;
  } catch (e) {
    const updated = (await updateFeedItem(item.id, { triage_error: e instanceof Error ? e.message : String(e) })) ?? item;
    emit(updated);
    return updated;
  } finally {
    setPhase(item.id, null);
  }
}

export async function triageItems(items: FeedItem[], concurrency = 3): Promise<void> {
  const queue = items.filter((i) => !triageProgress.has(i.id));
  if (!queue.length) return;
  // Show the whole batch as queued immediately so the UI can report "1 of 7"
  for (const i of queue) setPhase(i.id, "queued");
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length) {
      const next = queue.shift()!;
      await triageItem(next);
    }
  });
  try {
    await Promise.all(workers);
  } finally {
    for (const i of items) setPhase(i.id, null);
  }
}

// ---------------------------------------------------------------------------
// Tasks from actions
// ---------------------------------------------------------------------------

export function actionToInboxItem(item: FeedItem, action: FeedAction): InboxItem {
  const settings = getWorkSettingsV2();
  const today = nowIso().slice(0, 10);
  const isTheirs = action.court === "theirs";
  const request: CleanTaskRequest = {
    raw_text: `[Feed] ${action.title}${action.owner ? ` (${isTheirs ? "waiting on" : "with"} ${action.owner})` : ""}`,
    today,
    timezone: settings.timezone,
  };
  const due = isTheirs ? action.follow_up_by ?? action.due_at : action.due_at;
  const result: CleanTaskResponse = {
    title: action.title,
    due_at: due ? `${due}T${settings.end_of_day || "17:00"}:00` : null,
    scheduled_for: null,
    effort_min: isTheirs ? 5 : 15,
    energy: "med",
    tags: ["feed", ...(isTheirs ? ["waiting"] : []), ...(item.triage?.topics.slice(0, 3) ?? [])],
    project: item.project_name,
    subtasks: [],
    importance: isTheirs ? 55 : 70,
    notes_append: [item.triage?.summary, `Source: ${item.title}${item.source_date ? ` (${item.source_date})` : ""}`].filter(Boolean).join("\n"),
  } as CleanTaskResponse;

  const owner = canonicalOwner(action.owner);
  return {
    id: crypto.randomUUID(),
    created_at: nowIso(),
    status: isTheirs ? "follow-up" : "active",
    request,
    result,
    owner,
    court: action.court,
    waiting_since: isTheirs ? (item.source_date ? `${item.source_date}T12:00:00.000Z` : nowIso()) : null,
    email_context: action.owner
      ? { sender: action.owner, subject: item.title, email_date: item.source_date, contact: action.owner, follow_up_by: action.follow_up_by }
      : undefined,
  };
}

export async function createTasksFromActions(item: FeedItem, actionIdx: number[]): Promise<InboxItem[]> {
  if (!item.triage) return [];
  const created: InboxItem[] = [];
  const actions = item.triage.actions.map((a, i) => ({ ...a }));
  for (const i of actionIdx) {
    const a = actions[i];
    if (!a || a.linked_task_id) continue;
    const task = actionToInboxItem(item, a);
    a.linked_task_id = task.id;
    created.push(task);
  }
  if (created.length) {
    bulkAddInboxItems(created);
    const updated = await updateFeedItem(item.id, { triage: { ...item.triage, actions } });
    if (updated) emit(updated);
  }
  return created;
}
