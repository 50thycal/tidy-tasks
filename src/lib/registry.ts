/**
 * Project registry: substations and their work orders, imported from the
 * Substation Design Progress Report. Stored in localStorage (small, synchronous).
 *
 * Grouping rule (from the user): a substation with several work orders is
 * usually delivered as one package. Work orders under the same substation that
 * share the same submittal (milestone target) dates are one project.
 */

export type WorkOrderStatus = "ACTIVE" | "FUTURE" | "COMPLETE" | string;
export type IfcOnTrack = "YES" | "DELAYED" | "COMPLETE" | string | null;

export interface Milestone {
  label: string;
  proposed: string | null; // ISO date or "TBD"
  target: string | null;
  final: string | null;
  pct_complete: number | null; // 0..1
  adjusted: boolean; // target differs from proposed
}

export interface WorkOrder {
  wo: string;
  bmcd_project_no: string | null;
  region: string | null;
  substation: string; // as spelled in the report
  description: string;
  status: WorkOrderStatus;
  itc_assign_date: string | null;
  itc_lead: string | null;
  itc_supervisor: string | null;
  bmcd_lead: string | null;
  bmcd_civil: string | null;
  bmcd_structural: string | null;
  bmcd_project_services: string | null;
  bmi_approval: string | null;
  dte_ce_wo: string | null;
  next_milestone: string | null;
  next_milestone_due: string | null;
  ifc: string | null;
  ifc_on_track: IfcOnTrack;
  proposal_submitted: string | null;
  po_received: string | null;
  latest_authorization: string | null;
  site_visit: string | null;
  comments: string | null;
  milestones: Milestone[];
}

export interface MeetingSettings {
  cadence: "weekly" | "biweekly" | "none";
  weekday: number; // 0 = Sunday ... 6 = Saturday
  last_meeting_at: string | null; // ISO date
}

export interface Project {
  id: string;
  name: string; // display name, editable
  substation: string; // report spelling
  aliases: string[]; // WOs, project numbers, alternate names
  mine: boolean; // BMcD lead matches my last name
  pinned: boolean; // manually followed
  work_orders: WorkOrder[];
  meeting: MeetingSettings;
  stale_after_days: number;
  notes: string;
  updated_at: string;
}

export interface RegistryChange {
  wo: string;
  substation: string;
  field: string;
  from: string | null;
  to: string | null;
}

export interface RegistryImport {
  id: string;
  issue_date: string | null;
  imported_at: string;
  file_name: string;
  file_hash: string;
  work_order_count: number;
  changes: RegistryChange[];
}

export interface RegistryDoc {
  version: 1;
  projects: Project[];
  imports: RegistryImport[]; // newest first, capped
  last_issue_date: string | null;
}

const STORAGE_KEY = "tidy.registry";
const MAX_IMPORTS = 12;

export function emptyRegistry(): RegistryDoc {
  return { version: 1, projects: [], imports: [], last_issue_date: null };
}

export function getRegistry(): RegistryDoc {
  if (typeof window === "undefined") return emptyRegistry();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyRegistry();
    const parsed = JSON.parse(raw);
    if (parsed?.version !== 1 || !Array.isArray(parsed.projects)) return emptyRegistry();
    return parsed as RegistryDoc;
  } catch (e) {
    console.error("Error reading registry:", e);
    return emptyRegistry();
  }
}

export function saveRegistry(doc: RegistryDoc): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
}

export function clearRegistry(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

/**
 * Dates that define "the same package". Work orders delivered together share the
 * same Design Complete target (or IFC) and the same next milestone. Labels differ
 * between work orders (e.g. "SSVT LLMR" vs "LLMR"), so only the dates are compared.
 */
export function submittalSignature(wo: WorkOrder): string {
  const dc = [...wo.milestones].reverse().find((m) => /design complete/i.test(m.label));
  const primary = dc?.target ?? wo.ifc ?? "";
  return `${primary}|${wo.next_milestone ?? ""}|${wo.next_milestone_due ?? ""}`;
}

export function normalizeSubstation(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Group a flat list of work orders into project candidates. */
export function groupWorkOrders(workOrders: WorkOrder[]): Array<{ substation: string; work_orders: WorkOrder[] }> {
  const bySub = new Map<string, WorkOrder[]>();
  for (const wo of workOrders) {
    const key = normalizeSubstation(wo.substation);
    if (!bySub.has(key)) bySub.set(key, []);
    bySub.get(key)!.push(wo);
  }

  const groups: Array<{ substation: string; work_orders: WorkOrder[] }> = [];
  bySub.forEach((wos) => {
    const bySig = new Map<string, WorkOrder[]>();
    for (const wo of wos) {
      const sig = submittalSignature(wo);
      if (!bySig.has(sig)) bySig.set(sig, []);
      bySig.get(sig)!.push(wo);
    }
    bySig.forEach((list) => {
      groups.push({ substation: list[0].substation.trim(), work_orders: list });
    });
  });
  return groups;
}

function defaultMeeting(): MeetingSettings {
  return { cadence: "weekly", weekday: 2, last_meeting_at: null };
}

function displayName(substation: string, isPrimary: boolean, wos: WorkOrder[]): string {
  // "Cannoli / Panattoni" -> "Cannoli". Only non-primary sibling groups get a suffix.
  const base = substation.split("/")[0].trim();
  if (isPrimary) return base;
  const active = wos.find((w) => w.status === "ACTIVE") ?? wos[0];
  const desc = active.description.length > 40 ? active.description.slice(0, 37) + "..." : active.description;
  return `${base} (${desc})`;
}

/** Among sibling groups at one substation, the primary is: mine, then most ACTIVE work orders, then largest. */
function pickPrimary(groups: Array<{ substation: string; work_orders: WorkOrder[] }>, myLast: string | null): Set<number> {
  const bySub = new Map<string, number[]>();
  groups.forEach((g, i) => {
    const k = normalizeSubstation(g.substation);
    if (!bySub.has(k)) bySub.set(k, []);
    bySub.get(k)!.push(i);
  });
  const primary = new Set<number>();
  bySub.forEach((idxs) => {
    const score = (i: number) => {
      const wos = groups[i].work_orders;
      const mine = myLast && wos.some((w) => (w.bmcd_lead ?? "").toLowerCase().includes(myLast)) ? 1000 : 0;
      const active = wos.filter((w) => w.status === "ACTIVE").length * 10;
      return mine + active + wos.length;
    };
    primary.add(idxs.slice().sort((a, b) => score(b) - score(a))[0]);
  });
  return primary;
}

export function aliasesFor(substation: string, wos: WorkOrder[]): string[] {
  const set = new Set<string>();
  substation.split("/").forEach((s) => s.trim() && set.add(s.trim()));
  for (const wo of wos) {
    set.add(wo.wo);
    if (wo.bmcd_project_no) set.add(wo.bmcd_project_no);
    if (wo.dte_ce_wo) set.add(wo.dte_ce_wo);
  }
  return Array.from(set);
}

// ---------------------------------------------------------------------------
// Merge an import into the registry
// ---------------------------------------------------------------------------

export interface MergeResult {
  doc: RegistryDoc;
  importRecord: RegistryImport;
  mine: Project[];
}

export function mergeImport(
  current: RegistryDoc,
  incoming: WorkOrder[],
  meta: { issue_date: string | null; file_name: string; file_hash: string; my_last_name: string | null }
): MergeResult {
  const now = new Date().toISOString();
  const previousByWo = new Map<string, WorkOrder>();
  for (const p of current.projects) for (const w of p.work_orders) previousByWo.set(w.wo, w);

  const changes = diffWorkOrders(previousByWo, incoming);
  const groups = groupWorkOrders(incoming);

  const used = new Set<string>();
  const nextProjects: Project[] = [];
  const myLast = meta.my_last_name?.trim().toLowerCase() || null;
  const primaries = pickPrimary(groups, myLast);

  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];
    const woSet = new Set(g.work_orders.map((w) => w.wo));
    // Find the existing project with the most overlapping work orders
    let best: Project | null = null;
    let bestOverlap = 0;
    for (const p of current.projects) {
      if (used.has(p.id)) continue;
      const overlap = p.work_orders.filter((w) => woSet.has(w.wo)).length;
      if (overlap > bestOverlap) {
        best = p;
        bestOverlap = overlap;
      }
    }

    const mine = myLast
      ? g.work_orders.some((w) => (w.bmcd_lead ?? "").toLowerCase().includes(myLast))
      : false;
    const autoAliases = aliasesFor(g.substation, g.work_orders);

    if (best) {
      used.add(best.id);
      const userAliases = best.aliases.filter((a) => !aliasesFor(best!.substation, best!.work_orders).includes(a));
      nextProjects.push({
        ...best,
        substation: g.substation,
        work_orders: g.work_orders,
        aliases: Array.from(new Set([...autoAliases, ...userAliases])),
        mine,
        updated_at: now,
      });
    } else {
      nextProjects.push({
        id: crypto.randomUUID(),
        name: displayName(g.substation, primaries.has(gi), g.work_orders),
        substation: g.substation,
        aliases: autoAliases,
        mine,
        pinned: false,
        work_orders: g.work_orders,
        meeting: defaultMeeting(),
        stale_after_days: 7,
        notes: "",
        updated_at: now,
      });
    }
  }

  // Keep projects that vanished from the report only if pinned (user cares)
  for (const p of current.projects) {
    if (!used.has(p.id) && p.pinned) nextProjects.push({ ...p, updated_at: now });
  }

  const importRecord: RegistryImport = {
    id: crypto.randomUUID(),
    issue_date: meta.issue_date,
    imported_at: now,
    file_name: meta.file_name,
    file_hash: meta.file_hash,
    work_order_count: incoming.length,
    changes,
  };

  const doc: RegistryDoc = {
    version: 1,
    projects: nextProjects.sort(projectSort),
    imports: [importRecord, ...current.imports].slice(0, MAX_IMPORTS),
    last_issue_date: meta.issue_date ?? current.last_issue_date,
  };

  return { doc, importRecord, mine: doc.projects.filter((p) => p.mine) };
}

function projectSort(a: Project, b: Project): number {
  const rank = (p: Project) => (p.mine ? 0 : p.pinned ? 1 : 2);
  const r = rank(a) - rank(b);
  if (r !== 0) return r;
  return a.name.localeCompare(b.name);
}

const DIFF_FIELDS: Array<keyof WorkOrder> = [
  "status",
  "description",
  "itc_lead",
  "itc_supervisor",
  "bmcd_lead",
  "next_milestone",
  "next_milestone_due",
  "ifc",
  "ifc_on_track",
  "comments",
  "latest_authorization",
  "site_visit",
];

export function diffWorkOrders(previous: Map<string, WorkOrder>, incoming: WorkOrder[]): RegistryChange[] {
  const changes: RegistryChange[] = [];
  for (const wo of incoming) {
    const prev = previous.get(wo.wo);
    if (!prev) {
      // Only flag brand-new work orders when a previous import existed at all
      if (previous.size > 0) {
        changes.push({ wo: wo.wo, substation: wo.substation, field: "work_order", from: null, to: "added" });
      }
      continue;
    }
    for (const f of DIFF_FIELDS) {
      const a = (prev[f] ?? null) as string | null;
      const b = (wo[f] ?? null) as string | null;
      if (a !== b) changes.push({ wo: wo.wo, substation: wo.substation, field: f, from: a, to: b });
    }
    const prevMs = new Map(prev.milestones.map((m) => [m.label, m]));
    for (const m of wo.milestones) {
      const pm = prevMs.get(m.label);
      if (!pm) {
        changes.push({ wo: wo.wo, substation: wo.substation, field: `milestone:${m.label}`, from: null, to: m.target });
        continue;
      }
      if ((pm.target ?? null) !== (m.target ?? null)) {
        changes.push({ wo: wo.wo, substation: wo.substation, field: `milestone:${m.label}:target`, from: pm.target, to: m.target });
      }
      if ((pm.final ?? null) !== (m.final ?? null)) {
        changes.push({ wo: wo.wo, substation: wo.substation, field: `milestone:${m.label}:final`, from: pm.final, to: m.final });
      }
    }
  }
  return changes;
}

// ---------------------------------------------------------------------------
// Queries and mutations
// ---------------------------------------------------------------------------

export function getProjects(): Project[] {
  return getRegistry().projects;
}

export function getFollowedProjects(): Project[] {
  return getRegistry().projects.filter((p) => p.mine || p.pinned);
}

export function getProjectById(id: string): Project | null {
  return getRegistry().projects.find((p) => p.id === id) ?? null;
}

export function getProjectByName(name: string): Project | null {
  const n = name.trim().toLowerCase();
  return (
    getRegistry().projects.find(
      (p) => p.name.toLowerCase() === n || p.substation.toLowerCase() === n || p.aliases.some((a) => a.toLowerCase() === n)
    ) ?? null
  );
}

export function updateProject(id: string, patch: Partial<Project>): Project | null {
  const doc = getRegistry();
  let updated: Project | null = null;
  doc.projects = doc.projects.map((p) => {
    if (p.id !== id) return p;
    updated = { ...p, ...patch, updated_at: new Date().toISOString() };
    return updated;
  });
  doc.projects.sort(projectSort);
  saveRegistry(doc);
  return updated;
}

export function setPinned(id: string, pinned: boolean): void {
  updateProject(id, { pinned });
}

/** Create a project that is not in the report (manual). */
export function addManualProject(name: string): Project {
  const doc = getRegistry();
  const existing = doc.projects.find((p) => p.name.toLowerCase() === name.trim().toLowerCase());
  if (existing) return existing;
  const p: Project = {
    id: crypto.randomUUID(),
    name: name.trim(),
    substation: name.trim(),
    aliases: [name.trim()],
    mine: false,
    pinned: true,
    work_orders: [],
    meeting: defaultMeeting(),
    stale_after_days: 7,
    notes: "",
    updated_at: new Date().toISOString(),
  };
  doc.projects.push(p);
  doc.projects.sort(projectSort);
  saveRegistry(doc);
  return p;
}

/** Next milestone that is not complete, across a project's work orders. */
export function nextMilestone(p: Project): { label: string; date: string | null; wo: string } | null {
  let best: { label: string; date: string | null; wo: string } | null = null;
  for (const wo of p.work_orders) {
    if (wo.status === "COMPLETE") continue;
    const candidates = wo.milestones.filter((m) => (m.pct_complete ?? 0) < 1 && !m.final);
    for (const m of candidates) {
      const d = m.target && /^\d{4}-\d{2}-\d{2}$/.test(m.target) ? m.target : null;
      if (!best) best = { label: m.label, date: d, wo: wo.wo };
      else if (d && (!best.date || d < best.date)) best = { label: m.label, date: d, wo: wo.wo };
    }
    if (candidates.length === 0 && wo.next_milestone && !best) {
      best = { label: wo.next_milestone, date: wo.next_milestone_due && /^\d{4}/.test(wo.next_milestone_due) ? wo.next_milestone_due : null, wo: wo.wo };
    }
  }
  return best;
}

export function projectPeople(p: Project): Array<{ name: string; role: string; org: "ITC" | "BMcD" }> {
  const out = new Map<string, { name: string; role: string; org: "ITC" | "BMcD" }>();
  for (const wo of p.work_orders) {
    const add = (name: string | null, role: string, org: "ITC" | "BMcD") => {
      if (!name || name === "N/A") return;
      const key = `${org}:${name}`;
      if (!out.has(key)) out.set(key, { name, role, org });
    };
    add(wo.itc_lead, "ITC Project Lead", "ITC");
    add(wo.itc_supervisor, "ITC Supervisor", "ITC");
    add(wo.bmcd_lead, "BMcD Project Lead", "BMcD");
    add(wo.bmcd_civil, "BMcD Civil", "BMcD");
    add(wo.bmcd_structural, "BMcD Structural", "BMcD");
    add(wo.bmcd_project_services, "BMcD Project Services", "BMcD");
  }
  return Array.from(out.values());
}

/** Days since the report was issued, or null if never imported. */
export function reportAgeDays(doc: RegistryDoc = getRegistry()): number | null {
  if (!doc.last_issue_date) return null;
  const ms = Date.now() - new Date(doc.last_issue_date + "T12:00:00").getTime();
  return Math.floor(ms / 86_400_000);
}

/** Re-evaluate the "mine" flag against a last name without re-importing. Returns count marked mine. */
export function recomputeMine(myLastName: string | null | undefined): number {
  const doc = getRegistry();
  const my = (myLastName ?? "").trim().toLowerCase();
  let n = 0;
  doc.projects = doc.projects.map((p) => {
    const mine = !!my && p.work_orders.some((w) => (w.bmcd_lead ?? "").toLowerCase().includes(my));
    if (mine) n++;
    return { ...p, mine };
  });
  doc.projects.sort(projectSort);
  saveRegistry(doc);
  return n;
}

/** Distinct BMcD lead names currently in the registry. */
export function registryLeads(): string[] {
  const set = new Set<string>();
  for (const p of getRegistry().projects) for (const w of p.work_orders) if (w.bmcd_lead) set.add(w.bmcd_lead);
  return Array.from(set).sort();
}
