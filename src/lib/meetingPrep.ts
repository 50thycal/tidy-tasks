/**
 * Meeting prep orchestration: gather what is new for a project, ask the AI for
 * proposals against the living agenda, and finalize a meeting (snapshot the
 * outline, mark feed items covered, stamp the meeting date).
 */

import { getAgenda, putAgenda, getFeedItemsForProject, markItemsCovered, type FeedItem, type LivingAgenda, type AgendaSection } from "./feedStore";
import { getProjectById, updateProject, projectPeople, type Project } from "./registry";
import { getWorkSettingsV2 } from "./settings";
import { getInboxItems } from "./clientStore";
import { agendaForPrompt, resolveBulletId, serializeOutline, emptyAgenda, type PrepProposals, type ProposedInsert } from "./agenda";

export async function loadAgenda(projectId: string): Promise<LivingAgenda> {
  return (await getAgenda(projectId)) ?? emptyAgenda(projectId);
}

export async function saveAgendaSections(projectId: string, sections: AgendaSection[]): Promise<LivingAgenda> {
  const cur = await loadAgenda(projectId);
  const next = { ...cur, sections };
  await putAgenda(next);
  return next;
}

/** Feed items that should be considered for the next meeting. */
export async function itemsForPrep(projectId: string): Promise<FeedItem[]> {
  const all = await getFeedItemsForProject(projectId);
  const isChainParent = (i: FeedItem) => all.some((c) => c.parent_id === i.id);
  return all
    .filter((i) => (i.status === "new" || i.status === "triaged") && !isChainParent(i))
    .sort((a, b) => ((a.source_date ?? a.captured_at) < (b.source_date ?? b.captured_at) ? -1 : 1));
}

function excerpt(text: string, max = 900): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

export async function requestProposals(project: Project, agenda: LivingAgenda, items: FeedItem[]): Promise<PrepProposals> {
  const settings = getWorkSettingsV2();
  const openTasks = getInboxItems()
    .filter((t) => t.status !== "done" && t.result.project && t.result.project.toLowerCase() === project.name.toLowerCase())
    .slice(0, 60)
    .map((t) => `${t.status === "follow-up" ? "[waiting] " : ""}${t.result.title}${t.result.due_at ? ` (due ${t.result.due_at.slice(0, 10)})` : ""}`);

  const milestones = project.work_orders.flatMap((w) =>
    w.milestones.filter((m) => (m.pct_complete ?? 0) < 1).map((m) => `${w.wo} ${m.label}: ${m.target ?? "TBD"}${m.adjusted ? " (adjusted)" : ""}`)
  );

  const body = {
    today: new Date().toISOString().slice(0, 10),
    timezone: settings.timezone,
    my_name: settings.my_last_name ?? null,
    project: {
      name: project.name,
      work_orders: project.work_orders.map((w) => `${w.wo} ${w.description}`),
      people: projectPeople(project).map((p) => `${p.name} (${p.role})`),
      milestones,
      last_meeting_at: agenda.last_meeting_at ?? project.meeting.last_meeting_at,
      cadence: project.meeting.cadence,
    },
    agenda: agendaForPrompt(agenda.sections),
    items: items.slice(0, 80).map((i) => ({
      id: i.id,
      kind: i.kind,
      title: i.title,
      source_date: i.source_date,
      summary: i.triage?.summary ?? null,
      agenda_section: i.triage?.agenda_section ?? null,
      decisions: i.triage?.decisions ?? [],
      open_questions: i.triage?.open_questions ?? [],
      dates: i.triage?.dates ?? [],
      actions: i.triage?.actions ?? [],
      excerpt: i.triage ? null : excerpt(i.text),
    })),
    open_tasks: openTasks,
    stale_after_days: project.stale_after_days,
  };

  const res = await fetch("/api/ai/prep_meeting", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  const data = await res.json();

  const itemIds = new Set(items.map((i) => i.id));
  const inserts: ProposedInsert[] = (data.inserts as any[]).map((i) => ({
    id: crypto.randomUUID(),
    section: i.section,
    after_bullet_id: resolveBulletId(agenda.sections, i.after_bullet_id),
    depth: i.depth ?? 0,
    text: i.text,
    source_item_ids: (i.source_item_ids as string[]).filter((id) => itemIds.has(id)),
    reason: i.reason ?? "",
  }));
  const stale = (data.stale as any[])
    .map((s) => ({ bullet_id: resolveBulletId(agenda.sections, s.bullet_id), reason: s.reason ?? "" }))
    .filter((s): s is { bullet_id: string; reason: string } => !!s.bullet_id);
  return { summary: data.summary ?? "", inserts, stale, waiting_on: data.waiting_on ?? [] };
}

export interface FinalizeInput {
  project: Project;
  sections: AgendaSection[];
  meetingDate: string; // YYYY-MM-DD
  coveredItemIds: string[];
}

export async function finalizeMeeting(input: FinalizeInput): Promise<{ agenda: LivingAgenda; text: string }> {
  const cur = await loadAgenda(input.project.id);
  const meetingId = crypto.randomUUID();
  const text = serializeOutline(input.sections);
  const agenda: LivingAgenda = {
    ...cur,
    sections: input.sections,
    last_meeting_at: input.meetingDate,
    snapshots: [{ meeting_id: meetingId, date: input.meetingDate, text, covered_item_ids: input.coveredItemIds }, ...cur.snapshots].slice(0, 30),
  };
  await putAgenda(agenda);
  if (input.coveredItemIds.length) await markItemsCovered(input.coveredItemIds, meetingId);
  updateProject(input.project.id, { meeting: { ...input.project.meeting, last_meeting_at: input.meetingDate } });
  return { agenda, text };
}

export function nextMeetingDate(project: Project, from = new Date()): string | null {
  if (project.meeting.cadence === "none") return null;
  const d = new Date(from);
  d.setHours(12, 0, 0, 0);
  const delta = (project.meeting.weekday - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + delta);
  if (project.meeting.cadence === "biweekly" && project.meeting.last_meeting_at) {
    const last = new Date(project.meeting.last_meeting_at + "T12:00:00");
    const days = Math.round((d.getTime() - last.getTime()) / 86_400_000);
    if (days > 0 && days < 14 && days % 14 !== 0) d.setDate(d.getDate() + (14 - days));
  }
  return d.toISOString().slice(0, 10);
}

export { getProjectById };
