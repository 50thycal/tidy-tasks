/**
 * Parser for the Burns & McDonnell "Substation Design Progress Report" workbook.
 * Runs in the browser with SheetJS. Reads:
 *  - `NewProgressReport`: flat, one row per work order (primary)
 *  - `Active Projects`: blocked, project header row + milestone sub-rows
 *  - `Completed Projects`: same block layout (milestones only, optional)
 *
 * Nothing here talks to the network or the AI.
 */

import * as XLSX from "xlsx";
import type { WorkOrder, Milestone } from "./registry";

export interface ProgressReportParse {
  issue_date: string | null;
  work_orders: WorkOrder[];
  warnings: string[];
  /** Distinct BMcD lead names seen, for diagnosing a failed "mine" match */
  leads: string[];
}

type Cell = string | number | boolean | Date | null | undefined;

function str(v: Cell): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return isoDate(v);
  const s = String(v).trim();
  return s.length ? s : null;
}

function isoDate(d: Date): string {
  // SheetJS gives local-midnight dates when cellDates is on; format without TZ shift
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Date cells can be Date, "TBD", "N/A", "6/24/2026 / TBD", or "8/4/2026 / 8/6/2026". */
function dateish(v: Cell): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return isoDate(v);
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
    return null;
  }
  const s = String(v).trim();
  if (!s) return null;
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  return s.toUpperCase() === "N/A" ? null : s; // keep "TBD"
}

function pct(v: Cell): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return v > 1 ? v / 100 : v;
  const n = parseFloat(String(v).replace("%", ""));
  if (Number.isNaN(n)) return null;
  return n > 1 ? n / 100 : n;
}

function norm(s: Cell): string {
  return String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function findHeaderRow(rows: Cell[][], mustContain: string[]): number {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const cells = rows[i].map(norm);
    if (mustContain.every((h) => cells.some((c) => c.includes(h)))) return i;
  }
  return -1;
}

function colIndex(header: Cell[], ...needles: string[]): number {
  const cells = header.map(norm);
  for (const n of needles) {
    const i = cells.findIndex((c) => c === n);
    if (i >= 0) return i;
  }
  for (const n of needles) {
    const i = cells.findIndex((c) => c.includes(n));
    if (i >= 0) return i;
  }
  return -1;
}

const WO_RE = /^[A-Z]\d{7}$/;

export function parseProgressReport(data: ArrayBuffer, fileName = "report.xlsm"): ProgressReportParse {
  const warnings: string[] = [];
  const wb = XLSX.read(data, { type: "array", cellDates: true, cellNF: false, cellText: false });

  const flatName = wb.SheetNames.find((n) => norm(n) === "newprogressreport");
  if (!flatName) {
    throw new Error(`"${fileName}" has no NewProgressReport sheet. Sheets: ${wb.SheetNames.join(", ")}`);
  }
  const flat = XLSX.utils.sheet_to_json<Cell[]>(wb.Sheets[flatName], { header: 1, raw: true, defval: null });

  // Issue date lives near the top: "Issue Date:" followed by a date cell
  let issue_date: string | null = null;
  for (const row of flat.slice(0, 5)) {
    const i = row.findIndex((c) => norm(c).startsWith("issue date"));
    if (i >= 0) {
      issue_date = dateish(row[i + 1]);
      break;
    }
  }

  const h = findHeaderRow(flat, ["work order", "substation"]);
  if (h < 0) throw new Error("NewProgressReport header row not found (expected 'Work Order' and 'Substation' headers)");
  const H = flat[h];
  const c = {
    region: colIndex(H, "region"),
    wo: colIndex(H, "work order"),
    sub: colIndex(H, "substation name", "substation"),
    desc: colIndex(H, "project description"),
    status: colIndex(H, "status"),
    assign: colIndex(H, "itc assign date"),
    itcLead: colIndex(H, "itc project lead", "itc lead", "itc pm"),
    itcSup: colIndex(H, "itc supervisor", "supervisor"),
    lead: colIndex(H, "bmcd project lead", "bmcd design lead", "bmcd lead", "project lead", "design lead", "bmcd pm"),
    dte: colIndex(H, "dte/ce work order", "dte/ce wo"),
    nextMs: colIndex(H, "next milestone"),
    nextDue: colIndex(H, "next milestone due date", "next milestone due"),
    ifc: colIndex(H, "ifc"),
    onTrack: colIndex(H, "ifc on track"),
    projNo: colIndex(H, "bmcd project number", "bmcd project #"),
    proposal: colIndex(H, "proposal submitted"),
    po: colIndex(H, "po received"),
    auth: colIndex(H, "additional authorization"),
    site: colIndex(H, "site visit"),
    comments: colIndex(H, "design completion status", "comments"),
  };
  const cell = (row: Cell[], idx: number): Cell => (idx >= 0 ? row[idx] : null);

  const byWo = new Map<string, WorkOrder>();
  for (const row of flat.slice(h + 1)) {
    const wo = str(row[c.wo]);
    if (!wo || !WO_RE.test(wo)) continue;
    const sub = str(cell(row, c.sub));
    if (!sub) {
      warnings.push(`Row for ${wo} has no substation name; skipped`);
      continue;
    }
    const rec: WorkOrder = {
      wo,
      bmcd_project_no: str(cell(row, c.projNo)),
      region: str(cell(row, c.region)),
      substation: sub,
      description: str(cell(row, c.desc)) ?? "",
      status: (str(cell(row, c.status)) ?? "ACTIVE").toUpperCase(),
      itc_assign_date: dateish(cell(row, c.assign)),
      itc_lead: str(cell(row, c.itcLead)),
      itc_supervisor: str(cell(row, c.itcSup)),
      bmcd_lead: str(cell(row, c.lead)),
      bmcd_civil: null,
      bmcd_structural: null,
      bmcd_project_services: null,
      bmi_approval: null,
      dte_ce_wo: str(cell(row, c.dte)),
      next_milestone: str(cell(row, c.nextMs)),
      next_milestone_due: dateish(cell(row, c.nextDue)),
      ifc: dateish(cell(row, c.ifc)),
      ifc_on_track: str(cell(row, c.onTrack))?.toUpperCase() ?? null,
      proposal_submitted: dateish(cell(row, c.proposal)),
      po_received: dateish(cell(row, c.po)),
      latest_authorization: dateish(cell(row, c.auth)),
      site_visit: dateish(cell(row, c.site)),
      comments: str(cell(row, c.comments)),
      milestones: [],
    };
    if (byWo.has(wo)) warnings.push(`Duplicate work order ${wo} in NewProgressReport; last row wins`);
    byWo.set(wo, rec);
  }

  // Blocked sheets: milestones + discipline leads
  for (const sheetName of wb.SheetNames) {
    const n = norm(sheetName);
    if (n !== "active projects" && n !== "completed projects") continue;
    try {
      attachBlockSheet(wb.Sheets[sheetName], byWo, warnings);
    } catch (e) {
      warnings.push(`Could not read "${sheetName}": ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const work_orders = Array.from(byWo.values());
  const leads = Array.from(new Set(work_orders.map((w) => w.bmcd_lead).filter((x): x is string => !!x))).sort();
  if (c.lead < 0) warnings.push(`NewProgressReport has no BMcD lead column (headers: ${H.map(norm).filter(Boolean).join(" | ")}); using Active Projects instead`);
  return { issue_date, work_orders, warnings, leads };
}

function attachBlockSheet(sheet: XLSX.WorkSheet, byWo: Map<string, WorkOrder>, warnings: string[]) {
  const rows = XLSX.utils.sheet_to_json<Cell[]>(sheet, { header: 1, raw: true, defval: null, range: undefined });
  const h = findHeaderRow(rows, ["work order", "proposed issue date", "target issue date"]);
  if (h < 0) return;
  const H = rows[h];
  const c = {
    label: colIndex(H, "substation location"),
    wo: colIndex(H, "work order"),
    proposed: colIndex(H, "proposed issue date"),
    target: colIndex(H, "target issue date"),
    final: colIndex(H, "final issue date"),
    pct: colIndex(H, "% design complete", "percent design complete"),
    lead: colIndex(H, "bmcd design lead", "bmcd project lead", "bmcd lead", "design lead"),
    itcLead: colIndex(H, "itc project lead", "itc lead"),
    civil: colIndex(H, "bmcd civil"),
    structural: colIndex(H, "bmcd structural"),
    services: colIndex(H, "bmcd project services"),
    bmi: colIndex(H, "bmi approval"),
  };
  // "SUBSTATION LOCATION" header can sit one row below in the Completed sheet; fall back to column B
  const labelCol = c.label >= 0 ? c.label : 1;

  let current: WorkOrder | null = null;
  for (const row of rows.slice(h + 1)) {
    if (!row.some((v) => v !== null && v !== "")) continue;
    const wo = str(row[c.wo]);
    if (wo && WO_RE.test(wo)) {
      current = byWo.get(wo) ?? null;
      if (!current) continue;
      current.milestones = [];
      const get = (idx: number) => (idx >= 0 ? str(row[idx]) : null);
      current.bmcd_civil = get(c.civil);
      current.bmcd_structural = get(c.structural);
      current.bmcd_project_services = get(c.services);
      current.bmi_approval = get(c.bmi);
      // The flat sheet sometimes lacks the lead columns; the block sheet always has them
      if (!current.bmcd_lead) current.bmcd_lead = get(c.lead);
      if (!current.itc_lead) current.itc_lead = get(c.itcLead);
      continue;
    }
    if (!current) continue;
    const label = str(row[labelCol]);
    if (!label) continue;
    // Section banners are all-caps with no dates; skip them
    const proposed = c.proposed >= 0 ? dateish(row[c.proposed]) : null;
    const target = c.target >= 0 ? dateish(row[c.target]) : null;
    const final = c.final >= 0 ? dateish(row[c.final]) : null;
    const pc = c.pct >= 0 ? pct(row[c.pct]) : null;
    if (!proposed && !target && !final && pc === null) {
      if (label === label.toUpperCase()) current = null;
      continue;
    }
    const m: Milestone = {
      label,
      proposed,
      target,
      final,
      pct_complete: pc,
      adjusted: !!proposed && !!target && proposed !== target,
    };
    current.milestones.push(m);
  }
  void warnings;
}

export function isProgressReportFile(file: File): boolean {
  const n = file.name.toLowerCase();
  return (n.endsWith(".xlsm") || n.endsWith(".xlsx")) && /progress|report/.test(n);
}

/** Cheap sniff for any spreadsheet that might be the progress report. */
export async function sniffProgressReport(data: ArrayBuffer): Promise<boolean> {
  try {
    const wb = XLSX.read(data, { type: "array", bookSheets: true });
    return wb.SheetNames.some((n) => norm(n) === "newprogressreport");
  } catch {
    return false;
  }
}
