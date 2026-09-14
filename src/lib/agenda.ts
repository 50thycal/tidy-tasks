/**
 * Living agenda helpers: parse a pasted outline into sections and nested
 * bullets, serialize back to the plain-text style the user publishes, and
 * apply accepted meeting-prep proposals. Pure functions; storage lives in
 * feedStore (IndexedDB).
 */

import type { LivingAgenda, AgendaSection, AgendaBullet } from "./feedStore";

const BULLET_RE = /^(\s*)([*\-•·o▪◦]|\d+[.)])\s+(.*)$/;

function uid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `id-${Math.random().toString(36).slice(2)}`;
}

export function newBullet(text: string, depth = 0, sourceIds: string[] = []): AgendaBullet {
  return { id: uid(), text: text.trim(), depth: Math.max(0, depth), added_at: new Date().toISOString(), source_item_ids: sourceIds };
}

export function newSection(heading: string, bullets: AgendaBullet[] = []): AgendaSection {
  return { id: uid(), heading: heading.trim(), bullets };
}

export function emptyAgenda(projectId: string): LivingAgenda {
  return { project_id: projectId, sections: [], updated_at: new Date().toISOString(), last_meeting_at: null, snapshots: [] };
}

/**
 * Parse pasted meeting notes. Non-bullet, non-empty lines are section headings.
 * Bullet lines (*, -, •, o, 1.) become bullets; depth comes from indentation
 * using the smallest positive indent seen as one level. A bullet with no
 * marker text ("* ") is skipped. Lines before the first heading go under
 * "General".
 */
export function parseOutline(raw: string): AgendaSection[] {
  const lines = raw.replace(/\r\n/g, "\n").replace(/ /g, " ").split("\n");
  // Detect indent unit
  let unit = 0;
  for (const line of lines) {
    const m = line.match(BULLET_RE);
    if (!m) continue;
    const ind = m[1].replace(/\t/g, "    ").length;
    if (ind > 0 && (unit === 0 || ind < unit)) unit = ind;
  }
  if (unit === 0) unit = 3;

  const sections: AgendaSection[] = [];
  let current: AgendaSection | null = null;
  let lastBullet: AgendaBullet | null = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, "");
    if (!line.trim()) continue;
    // A bare marker ("* ", "-") is an empty bullet; skip it
    if (/^\s*([*\-•·o▪◦]|\d+[.)])$/.test(line)) continue;
    const m = line.match(BULLET_RE);
    if (m) {
      const text = m[3].trim();
      if (!text) continue;
      const depth = Math.round(m[1].replace(/\t/g, "    ").length / unit);
      if (!current) {
        current = newSection("General");
        sections.push(current);
      }
      lastBullet = newBullet(text, depth);
      current.bullets.push(lastBullet);
      continue;
    }
    // Continuation line (indented text without a marker) attaches to the previous bullet
    if (/^\s+\S/.test(line) && lastBullet) {
      lastBullet.text += " " + line.trim();
      continue;
    }
    // Heading
    const heading = line.trim().replace(/\s*[-:]+\s*$/, "").trim();
    if (!heading) continue;
    current = newSection(heading);
    sections.push(current);
    lastBullet = null;
  }
  return sections.filter((s) => s.heading || s.bullets.length);
}

/** Serialize in the user's published style: heading lines, "* " bullets, 3-space nesting. */
export function serializeOutline(sections: AgendaSection[], opts: { indent?: number; blankLineBetweenSections?: boolean } = {}): string {
  const indent = opts.indent ?? 3;
  const out: string[] = [];
  for (const s of sections) {
    if (out.length) out.push("");
    out.push(s.heading);
    if (s.bullets.length) out.push("");
    for (const b of s.bullets) {
      out.push(`${" ".repeat(indent * b.depth)}* ${b.text}`);
    }
  }
  return out.join("\n").trim() + "\n";
}

/** Normalize headings for fuzzy matching between AI output and existing sections. */
export function normalizeHeading(h: string): string {
  return h
    .toLowerCase()
    .replace(/[^a-z0-9\s/&-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function findSection(sections: AgendaSection[], heading: string): AgendaSection | undefined {
  const n = normalizeHeading(heading);
  if (!n) return undefined;
  let best: AgendaSection | undefined;
  for (const s of sections) {
    const sn = normalizeHeading(s.heading);
    if (sn === n) return s;
    if (!best && (sn.includes(n) || n.includes(sn)) && Math.min(sn.length, n.length) >= 4) best = s;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Proposals (output of /api/ai/prep_meeting) and how they are applied
// ---------------------------------------------------------------------------

export interface ProposedInsert {
  id: string; // client-assigned for accept/reject tracking
  section: string; // existing heading or new heading
  after_bullet_id: string | null; // place after this bullet (child of it if depth > its depth), else end of section
  depth: number;
  text: string;
  source_item_ids: string[];
  reason: string;
}

export interface ProposedStale {
  bullet_id: string;
  reason: string;
}

export interface WaitingOnRow {
  owner: string;
  text: string;
  since: string | null;
  source_item_ids: string[];
}

export interface PrepProposals {
  inserts: ProposedInsert[];
  stale: ProposedStale[];
  waiting_on: WaitingOnRow[];
  summary: string;
}

export function applyInsert(sections: AgendaSection[], ins: ProposedInsert): AgendaSection[] {
  const next = sections.map((s) => ({ ...s, bullets: [...s.bullets] }));
  let section = findSection(next, ins.section);
  if (!section) {
    section = newSection(ins.section);
    next.push(section);
  }
  const bullet = newBullet(ins.text, ins.depth, ins.source_item_ids);
  if (ins.after_bullet_id) {
    const idx = section.bullets.findIndex((b) => b.id === ins.after_bullet_id);
    if (idx >= 0) {
      // Insert after the anchor and after any of its descendants
      const anchorDepth = section.bullets[idx].depth;
      let j = idx + 1;
      while (j < section.bullets.length && section.bullets[j].depth > anchorDepth) j++;
      // An update to a bullet is nested one level under it
      bullet.depth = anchorDepth + 1;
      section.bullets.splice(j, 0, bullet);
      return next;
    }
  }
  section.bullets.push({ ...bullet, depth: Math.min(ins.depth, 1) });
  return next;
}

export function removeBullet(sections: AgendaSection[], bulletId: string, withChildren = true): AgendaSection[] {
  return sections.map((s) => {
    const idx = s.bullets.findIndex((b) => b.id === bulletId);
    if (idx < 0) return s;
    const bullets = [...s.bullets];
    const depth = bullets[idx].depth;
    let end = idx + 1;
    if (withChildren) while (end < bullets.length && bullets[end].depth > depth) end++;
    bullets.splice(idx, end - idx);
    return { ...s, bullets };
  });
}

export function markStale(sections: AgendaSection[], bulletId: string, stale: boolean): AgendaSection[] {
  return sections.map((s) => ({ ...s, bullets: s.bullets.map((b) => (b.id === bulletId ? { ...b, stale } : b)) }));
}

/** Compact view of the agenda for the AI prompt: ids kept so proposals can anchor. */
export function agendaForPrompt(sections: AgendaSection[]): string {
  const lines: string[] = [];
  for (const s of sections) {
    lines.push(`## ${s.heading} [section]`);
    for (const b of s.bullets) lines.push(`${"  ".repeat(b.depth)}- (${b.id.slice(0, 8)}) ${b.text}${b.stale ? " [stale]" : ""}`);
  }
  return lines.join("\n");
}

/** Resolve a short id prefix from the model back to a full bullet id. */
export function resolveBulletId(sections: AgendaSection[], short: string | null): string | null {
  if (!short) return null;
  const s = short.replace(/[()]/g, "").trim();
  for (const sec of sections) for (const b of sec.bullets) if (b.id === s || b.id.startsWith(s)) return b.id;
  return null;
}
