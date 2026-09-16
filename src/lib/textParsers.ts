/**
 * Local (no AI) parsers for pasted content: content hashing, Teams thread
 * splitting, email chain splitting, date sniffing, and alias-based project
 * detection. All heuristics degrade to "one item, whole text" rather than fail.
 */

import type { Project } from "./registry";

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

export async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const buf = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  // Fallback (non-crypto) for environments without SubtleCrypto
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return `fallback-${(h >>> 0).toString(16)}`;
}

export async function hashArrayBuffer(buf: ArrayBuffer): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const d = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(d))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  return sha256(String(buf.byteLength));
}

/** Normalize text before hashing so trivial whitespace differences dedupe. */
export function normalizeForHash(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Find the first plausible full date in a string. Returns YYYY-MM-DD or null. */
export function sniffDate(text: string, fallbackYear = new Date().getFullYear()): string | null {
  // ISO
  let m = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  // M/D/YYYY or M/D/YY
  m = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return iso(y, +m[1], +m[2]);
  }
  // "September 8, 2026", "Sep 8 2026", "8 September 2026"
  m = text.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})\b/);
  if (m && MONTHS[m[1].toLowerCase()]) return iso(+m[3], MONTHS[m[1].toLowerCase()], +m[2]);
  m = text.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(20\d{2})\b/);
  if (m && MONTHS[m[2].toLowerCase()]) return iso(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
  // "9/8" with no year: assume current year
  m = text.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (m) return iso(fallbackYear, +m[1], +m[2]);
  return null;
}

/** "Date: Mon, 8 Sep 2026 14:02:11 -0500" style header. */
export function sniffEmailHeaderDate(text: string): string | null {
  const m = text.match(/^(?:Date|Sent):\s*(.+)$/im);
  if (!m) return null;
  const d = new Date(m[1].trim());
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return sniffDate(m[1]);
}

// ---------------------------------------------------------------------------
// Teams paste
// ---------------------------------------------------------------------------

export interface ParsedMessage {
  author: string | null;
  when: string | null; // ISO date if known
  text: string;
}

/**
 * Teams copies as blocks like:
 *   Josh Nickell  9/8 2:14 PM
 *   message text...
 * or "[9/8/2026 2:14 PM] Josh Nickell:" in older exports. Anything unrecognized
 * stays attached to the previous message.
 */
export function parseTeamsThread(raw: string, fallbackYear = new Date().getFullYear()): ParsedMessage[] {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const messages: ParsedMessage[] = [];
  const headerA = /^([A-Z][\w'.-]+(?:\s+[A-Z][\w'.-]+){0,3})\s{2,}(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)?,?\s*(\d{1,2}:\d{2}\s*(?:AM|PM))?\s*$/i;
  const headerB = /^\[(\d{1,2}\/\d{1,2}\/\d{2,4})[^\]]*\]\s*([^:]{2,60}):\s*(.*)$/;
  const headerC = /^([A-Z][\w'.-]+(?:\s+[A-Z][\w'.-]+){0,3})\s+(\d{1,2}:\d{2}\s*(?:AM|PM))\s*$/i;

  let cur: ParsedMessage | null = null;
  const push = () => {
    if (cur && cur.text.trim()) messages.push({ ...cur, text: cur.text.trim() });
  };

  for (const line of lines) {
    let m = line.match(headerB);
    if (m) {
      push();
      cur = { author: m[2].trim(), when: sniffDate(m[1], fallbackYear), text: m[3] ?? "" };
      continue;
    }
    m = line.match(headerA);
    if (m && (m[2] || m[3])) {
      push();
      cur = { author: m[1].trim(), when: m[2] ? sniffDate(m[2], fallbackYear) : null, text: "" };
      continue;
    }
    m = line.match(headerC);
    if (m) {
      push();
      cur = { author: m[1].trim(), when: null, text: "" };
      continue;
    }
    if (!cur) cur = { author: null, when: null, text: "" };
    cur.text += (cur.text ? "\n" : "") + line;
  }
  push();

  // Inherit dates downward when only the first header carried one
  let lastDate: string | null = null;
  for (const msg of messages) {
    if (msg.when) lastDate = msg.when;
    else msg.when = lastDate;
  }
  return messages;
}

export function looksLikeTeams(raw: string): boolean {
  const lines = raw.split("\n").slice(0, 40);
  let hits = 0;
  for (const l of lines) {
    if (/^\[?\d{1,2}\/\d{1,2}/.test(l.trim()) || /\d{1,2}:\d{2}\s*(AM|PM)\s*$/i.test(l.trim())) hits++;
  }
  return hits >= 2;
}

// ---------------------------------------------------------------------------
// Email chains
// ---------------------------------------------------------------------------

export interface ParsedEmail {
  from: string | null;
  to: string | null;
  subject: string | null;
  when: string | null;
  body: string;
}

const CHAIN_SPLIT = /\n(?=(?:From:\s.+\n(?:Sent|Date):\s.+)|(?:On .{10,120} wrote:)|(?:-{3,}\s*Original Message\s*-{3,})|(?:_{10,}))/g;

/** Split a pasted chain into individual messages, newest first (as pasted). */
export function splitEmailChain(raw: string): ParsedEmail[] {
  const text = raw.replace(/\r\n/g, "\n");
  const parts = text.split(CHAIN_SPLIT).map((p) => p.trim()).filter(Boolean);
  const out: ParsedEmail[] = [];
  for (const part of parts.length ? parts : [text]) {
    const header = (name: string) => {
      const m = part.match(new RegExp(`^${name}:\\s*(.+)$`, "im"));
      return m ? m[1].trim() : null;
    };
    const from = header("From");
    const to = header("To");
    const subject = header("Subject");
    const when = sniffEmailHeaderDate(part) ?? (part.match(/^On (.+?) wrote:/m) ? sniffDate(part.match(/^On (.+?) wrote:/m)![1]) : null);
    // Body = everything after the last header line at the top
    const body = part
      .split("\n")
      .filter((l) => !/^(From|To|Cc|CC|Sent|Date|Subject|Importance):\s/.test(l))
      .join("\n")
      .replace(/^On .{10,120} wrote:\s*/m, "")
      .replace(/^>+\s?/gm, "")
      .trim();
    out.push({ from, to, subject, when, body });
  }
  return out;
}

export function looksLikeEmail(raw: string): boolean {
  return /^(From|Subject|Sent|To):\s/im.test(raw.slice(0, 2000)) || /\bwrote:\s*$/m.test(raw);
}

// ---------------------------------------------------------------------------
// Project detection
// ---------------------------------------------------------------------------

export interface ProjectMatch {
  project: Project;
  alias: string;
  score: number;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Score projects by alias hits in the text. Work order and project numbers are
 * exact tokens and score high; names are word-boundary matches.
 */
export function detectProject(text: string, projects: Project[]): ProjectMatch | null {
  const hay = text.slice(0, 20_000);
  const lower = hay.toLowerCase();
  let best: ProjectMatch | null = null;
  for (const p of projects) {
    const aliases = Array.from(new Set([p.name, p.substation, ...p.aliases])).filter((a) => a && a.length >= 3);
    for (const alias of aliases) {
      const a = alias.toLowerCase();
      const isCode = /^[a-z]\d{7}$/i.test(alias) || /^\d{5,6}$/.test(alias) || /^dte\s?\d+$/i.test(alias);
      const re = new RegExp(`(^|[^a-z0-9])${escapeRe(a)}($|[^a-z0-9])`, "i");
      if (!re.test(lower)) continue;
      const count = (lower.match(new RegExp(escapeRe(a), "g")) ?? []).length;
      const base = isCode ? 100 : a.length >= 6 ? 20 : 8;
      const followed = p.mine || p.pinned ? 5 : 0;
      const score = base + followed + Math.min(count, 5);
      if (!best || score > best.score) best = { project: p, alias, score };
    }
  }
  return best;
}

/**
 * Words that never start or end a person's name in this domain. Used to reject
 * two-capitalized-word phrases like "The Siemens", "Relay Upgrade", "Sub Design".
 */
const NAME_STOPWORDS = new Set(
  (
    "the this that these those our your their his her its all both each any some no not and or but for with from into onto over under " +
    "hey hi hello dear good morning afternoon evening thanks thank regards sincerely best kind please note caution external sender " +
    "since during before after once when while because although however additionally lastly finally also just still now next then " +
    "project projects design designs department departments services service group groups team teams company companies " +
    "substation station stations switchyard relay relays breaker breakers panel panels bus line lines fiber conduit ground grounding " +
    "upgrade upgrades install installation replace replacement modify modification construct construction expansion " +
    "senior engineer engineers manager lead leads supervisor coordinator drafter analyst president director " +
    "log logs list lists sketch sketches drawing drawings package packages report reports point points sheet sheets " +
    "creek point hill grove ridge valley center centre park road way street energy transmission distribution " +
    "date dates time times week weeks month months day days morning update updates status question questions answer answers " +
    "request requests response responses item items issue issues action actions meeting meetings visit visits review reviews " +
    "phase rev revision final draft preliminary current existing new old attached below above per via " +
    "description automatically generated blue white black square rectangle sign letter logo yellow " +
    "burns mcdonnell itc bmcd dte google telco scada"
  ).split(" ")
);

function looksLikePersonName(name: string): boolean {
  const parts = name.split(/\s+/);
  if (parts.length < 2) return false;
  return !parts.some((w) => NAME_STOPWORDS.has(w.toLowerCase()));
}

/**
 * Turn one address-header entry into a display name.
 * "Bender, Elizabeth <ebender@x.com>" -> "Elizabeth Bender"
 * "Ryan Meaney <rmeaney@x.com>"       -> "Ryan Meaney"
 * "someone@x.com"                     -> null (no usable name)
 */
function displayNameFromAddress(entry: string): string | null {
  let s = entry.replace(/\r?\n[ \t]+/g, " ").trim();
  s = s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  s = s.replace(/^["']+|["']+$/g, "").replace(/[;,]+$/, "").trim();
  if (!s || s.length > 60 || /@/.test(s)) return null;
  // Distribution lists and shared mailboxes are not people
  if (/^dl\s/i.test(s) || /\b(group|team|list|mailbox|all|dept|department)$/i.test(s)) return null;
  // "Last, First M" -> "First Last"
  const c = s.match(/^([A-Z][\w'\u2019.-]+)\s*,\s*([A-Z][\w'\u2019.-]+)(?:\s+[A-Z]\.?)?$/);
  if (c) return `${c[2]} ${c[1]}`;
  if (!/[A-Za-z]/.test(s)) return null;
  return s;
}

/**
 * Names from From/To/Cc/Bcc headers. These are structured and reliable, so for
 * email content they are preferred over sniffing the body.
 */
export function parseEmailPeople(text: string, max = 20): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /^(?:From|To|Cc|CC|Bcc|Sender):[ \t]*(.+(?:\r?\n[ \t]+.+)*)$/gim;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    // Outlook separates recipients with semicolons; commas are part of "Last, First"
    for (const entry of m[1].split(";")) {
      const name = displayNameFromAddress(entry);
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(name);
      if (out.length >= max) return out;
    }
  }
  return out;
}

/**
 * Collapse "Bender" + "Elizabeth Bender" into just "Elizabeth Bender": a bare
 * contact surname is dropped when a fuller name for the same person is present.
 */
function collapseNames(names: string[]): string[] {
  const kept: string[] = [];
  for (const name of names) {
    const words = name.toLowerCase().split(/\s+/);
    const fullerExists = names.some(
      (other) =>
        other !== name &&
        other.split(/\s+/).length > words.length &&
        words.every((w) => other.toLowerCase().split(/\s+/).includes(w))
    );
    if (!fullerExists) kept.push(name);
  }
  return kept;
}

export interface SniffPeopleOptions {
  /** Prefer From/To/Cc headers and skip loose body sniffing. */
  isEmail?: boolean;
  /** Names that are never people here (project and substation names). */
  reject?: string[];
}

/**
 * People mentioned in a piece of content. Known contacts always win; for email,
 * the address headers are the source; loose body sniffing is a last resort and
 * is filtered hard, because a false name pollutes the contact list.
 */
export function sniffPeople(text: string, known: string[] = [], opts: SniffPeopleOptions = {}): string[] {
  const out = new Set<string>();
  const reject = new Set((opts.reject ?? []).map((r) => r.toLowerCase()));

  for (const k of known) {
    if (!k || k.length < 3) continue;
    const re = new RegExp(`(^|[^a-z])${escapeRe(k.toLowerCase())}($|[^a-z])`, "i");
    if (re.test(text)) out.add(k);
  }

  if (opts.isEmail) {
    for (const name of parseEmailPeople(text)) {
      if (out.size >= 25) break;
      if (reject.has(name.toLowerCase())) continue;
      out.add(name);
    }
    return collapseNames(Array.from(out));
  }

  const lowerKnown = known.map((k) => k.toLowerCase());
  const m = text.match(/\b[A-Z][a-z]{2,}\s[A-Z][a-z]{2,}\b/g) ?? [];
  for (const name of m) {
    if (out.size >= 25) break;
    if (lowerKnown.includes(name.toLowerCase())) continue;
    if (reject.has(name.toLowerCase())) continue;
    if (!looksLikePersonName(name)) continue;
    out.add(name);
  }
  return collapseNames(Array.from(out));
}

/** First non-empty line, trimmed to a title length. */
export function firstLineTitle(text: string, max = 90): string {
  const line = text.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "Untitled";
  return line.length > max ? line.slice(0, max - 1) + "…" : line;
}
