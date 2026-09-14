/**
 * Court board: every open thing grouped by whose court it is in. Sources are
 * open tasks (with owner/court) and feed actions that have not become tasks.
 */

import { getInboxItems, courtOf, ownerOf, type InboxItem, type TaskCourt } from "./clientStore";
import { getAllFeedItems, type FeedItem, type FeedAction } from "./feedStore";
import { canonicalOwner } from "./contacts";
import { getWorkSettingsV2 } from "./settings";

export interface CourtCard {
  key: string;
  kind: "task" | "feed";
  title: string;
  project: string | null;
  owner: string | null;
  court: TaskCourt;
  since: string | null; // ISO date the ball went in their court (or was captured)
  due: string | null; // YYYY-MM-DD follow-up / due date
  days_waiting: number;
  overdue: boolean;
  last_nudged_at: string | null;
  task?: InboxItem;
  feed?: { item: FeedItem; action: FeedAction; index: number };
}

export interface CourtColumn {
  key: string; // "mine" | "team" | owner name
  label: string;
  cards: CourtCard[];
  oldest_days: number;
  overdue: number;
}

export interface CourtBoard {
  mine: CourtColumn;
  team: CourtColumn;
  people: CourtColumn[]; // sorted by overdue then oldest waiting
  total_waiting: number;
}

function daysBetween(fromIso: string | null, to = new Date()): number {
  if (!fromIso) return 0;
  const from = new Date(fromIso.length === 10 ? fromIso + "T12:00:00" : fromIso);
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000));
}

function ymd(iso: string | null | undefined): string | null {
  return iso ? iso.slice(0, 10) : null;
}

export async function buildCourtBoard(): Promise<CourtBoard> {
  const today = new Date().toISOString().slice(0, 10);
  const cards: CourtCard[] = [];

  for (const t of getInboxItems()) {
    if (t.status === "done") continue;
    const court = courtOf(t);
    const owner = canonicalOwner(ownerOf(t));
    const since = court === "theirs" ? t.waiting_since ?? t.touched_at ?? t.created_at : t.created_at;
    const due = ymd(t.result.due_at) ?? (court === "theirs" ? ymd(t.email_context?.follow_up_by) : null);
    cards.push({
      key: `task:${t.id}`,
      kind: "task",
      title: t.result.title,
      project: t.result.project ?? null,
      owner,
      court,
      since,
      due,
      days_waiting: daysBetween(since),
      overdue: !!due && due < today,
      last_nudged_at: t.last_nudged_at ?? null,
      task: t,
    });
  }

  let feed: FeedItem[] = [];
  try {
    feed = await getAllFeedItems();
  } catch {
    /* IndexedDB unavailable */
  }
  for (const item of feed) {
    if (item.status !== "new" && item.status !== "triaged") continue;
    if (!item.triage) continue;
    item.triage.actions.forEach((a, index) => {
      if (a.linked_task_id) return;
      if (a.court === "mine") return; // "mine" feed actions are suggestions, not commitments, until made tasks
      const since = item.source_date ?? item.captured_at;
      const due = a.follow_up_by ?? a.due_at;
      cards.push({
        key: `feed:${item.id}:${index}`,
        kind: "feed",
        title: a.title,
        project: item.project_name,
        owner: a.court === "theirs" ? canonicalOwner(a.owner) : null,
        court: a.court,
        since,
        due,
        days_waiting: daysBetween(since),
        overdue: !!due && due < today,
        last_nudged_at: null,
        feed: { item, action: a, index },
      });
    });
  }

  const col = (key: string, label: string): CourtColumn => ({ key, label, cards: [], oldest_days: 0, overdue: 0 });
  const mine = col("mine", "Mine");
  const team = col("team", "Team");
  const people = new Map<string, CourtColumn>();

  for (const c of cards) {
    let target: CourtColumn;
    if (c.court === "mine") target = mine;
    else if (c.court === "team" || !c.owner) target = team;
    else {
      const k = c.owner.toLowerCase();
      if (!people.has(k)) people.set(k, col(c.owner, c.owner));
      target = people.get(k)!;
    }
    target.cards.push(c);
  }

  const finish = (c: CourtColumn) => {
    c.cards.sort((a, b) => (a.overdue !== b.overdue ? (a.overdue ? -1 : 1) : b.days_waiting - a.days_waiting));
    c.oldest_days = c.cards.reduce((m, x) => Math.max(m, x.days_waiting), 0);
    c.overdue = c.cards.filter((x) => x.overdue).length;
  };
  finish(mine);
  finish(team);
  const peopleCols = Array.from(people.values());
  peopleCols.forEach(finish);
  peopleCols.sort((a, b) => (b.overdue !== a.overdue ? b.overdue - a.overdue : b.oldest_days - a.oldest_days));

  return {
    mine,
    team,
    people: peopleCols,
    total_waiting: peopleCols.reduce((n, c) => n + c.cards.length, 0) + team.cards.length,
  };
}

/** Threshold after which a waiting item is considered stale. */
export function staleAfterDays(): number {
  void getWorkSettingsV2();
  return 5;
}
