# Plan: Project Feed + Meeting Prep, and three app improvements

Status: planning only. No code in this PR.
Date: 2026-09-14
Inputs reviewed: the full codebase, the 2026-09-14 backup (397 tasks), the AI-generated
company meeting minutes (.docx), the Cannoli RFI log (.xlsx), the change-log screenshot,
and the published Cannoli meeting notes pasted in the request.

---

## 0. What the data says about how the app is actually used

| Signal | Value | What it means |
|---|---|---|
| Tasks created per month, Nov 2025 to Jul 2026 | 32 to 61 | The app worked when input was easy |
| Tasks created Aug 2026 / Sep 2026 | 4 / 8 | Input friction won. Usage collapsed |
| Tasks with status `follow-up` right now | 0 of 19 open | "Whose court" is not being tracked in the app at all |
| Tasks with no project | 106 of 397 (27%) | Project routing still fails or is skipped |
| Tasks with `email_context` | 1 | Email Drop shipped but is barely used |
| Focus layouts saved | last one Nov 2025 | Focus queue abandoned |
| Weekly summaries saved | 0 | Weekly summary abandoned |
| Project schedule fields (LLMR / IFR / IFC) filled | 11 of 25 projects, all stale (Feb-Apr 2026) | Schedules are set once and never updated |
| Contacts in raw text | Lake, Faysal, Josh, John, Heidi, Lauren, Jacob, Stephen, Kelsey, Trinity, Chris, Delaney, Sean, ... | People are the real unit of follow-up, and the app has no concept of a person |

Conclusion: the core loop (capture, clean, prioritize, do) is fine. The failure is upstream.
Information arrives as Teams messages, email chains, RFI rows, meeting notes and hallway
conversations, and none of that has a home in the app. So tasks do not get created, and
"who owes what" lives in your head and in a Word doc. The meeting-prep feature you described
is the right fix because it is the intake layer the task app is missing. The three
improvements below are designed to sit on top of that same intake layer, not beside it.

---

## 1. The main feature: Project Feed + Meeting Prep

### 1.1 Reframing the "folder"

You described a folder per project that accepts everything, dates it, and has AI decide
what goes to the next meeting. I would keep that exactly, with two adjustments that make
it much more useful:

1. **The unit is a dated feed item, not a file.** Every drop (a file, a pasted Teams
   thread, a hallway note, an RFI log upload) becomes one or more *feed items* with
   `source_date`, `captured_at`, extracted text, and an AI triage result. Files are kept,
   but the feed is what you read and what the AI reads.
2. **Each project has a living agenda, and the AI edits it.** Your published notes are not
   a fresh document each week. They are a running outline (LLMR Rev 1, Sync Breakers,
   H-Frame, PRNC, Grounding, Phase 1 QC) where bullets get appended under existing
   headings and stale ones get pruned. So the AI's job is not "write meeting notes", it is
   "given the current outline and everything new since the last meeting, propose
   insertions under the right heading, flag what is stale, and list what is still waiting
   on someone". You accept or reject each proposal, then copy the outline out.

The second point is what stops things from being missed: the AI matches every new item
against the existing headings, so an email about Valmont automatically lands under
"H-Frame Update" instead of becoming a loose note you have to place.

### 1.2 User flow

```
[Drop anything]  ->  [Feed item created, project auto-detected, dated]
                 ->  [AI triage runs in background: summary, topics, owners, actions, dates]
                 ->  [Item shows in project feed as NEW with a "Meeting?" verdict]

[Meeting Prep]   ->  pick project  ->  "Prep next meeting"
                 ->  AI reads: living agenda + all NEW feed items since last meeting
                 ->  proposes: insertions per heading, new headings, stale bullets,
                               "waiting on" table, task suggestions
                 ->  you review inline, accept/edit/reject
                 ->  "Finalize" stamps the meeting date, marks items as covered,
                     creates accepted tasks, copies the outline to clipboard
```

The finalize step is the flywheel. It marks feed items as consumed (so next week starts
clean), pushes accepted action items into Inbox as tasks with owner and follow-up date, and
saves a snapshot of the outline so "what changed since last meeting" is a real diff.

### 1.3 Inputs and how each one is parsed

All parsing happens **in the browser**. Files never leave the laptop. Only the extracted
text (and only what is needed) goes to the AI route. This matters for two reasons: client
documents stay local, and Vercel serverless routes reject bodies over about 4.5 MB (the
Cannoli RFI log alone is 4.4 MB).

| Input | How it arrives | Parser | Notes |
|---|---|---|---|
| Raw text / hallway note | Paste box or quick-add | none | Gets `source_date = now` unless a date is typed |
| Teams thread | Copy from Teams, paste | Teams paste parser (new, heuristic) | Teams copy gives `Name  [time]` blocks; split into messages, keep author and time |
| Email chain (pasted) | Paste | existing `sanitizeEmailText` + new quoted-reply splitter | Split on `From:` / `On ... wrote:` so each message in the chain is its own dated sub-item and quoted duplicates are dropped |
| .eml / .msg | Drop | existing `emailParser.ts` | Already works. Test dragging straight from Outlook desktop into the drop zone: Chromium supports virtual-file drops so it should arrive as a .msg without a save step |
| .docx (company AI minutes, memos) | Drop | `mammoth` browser build | Also parse the Action Items table specifically: Description / Owner / Due / Context columns map straight onto feed actions |
| .xlsx (RFI log, change log) | Drop | SheetJS `xlsx` in browser | Sheet-aware importer with **row diffing** (see 1.5) |
| .pdf | Drop | `pdfjs-dist` text layer | Text PDFs only. Scanned PDFs get flagged "no text found" in v1 |
| Screenshot / image | Drop or paste | sent to the AI route as an image | gpt-4o-mini accepts images. Your change-log screenshot would work as-is |
| Existing meeting notes (the outline you publish) | Paste once per project | Outline parser | Seeds the living agenda. Headings become sections, bullets become items |

### 1.4 Data model (new, stored in IndexedDB)

localStorage caps at roughly 5 MB per origin and tasks already live there. The feed will
carry file blobs and long text, so it goes in IndexedDB (via the small `idb` wrapper).
Tasks stay where they are. Backup/export gains a `feed` table and, optionally, blobs.

```ts
interface FeedItem {
  id: string;
  project: string | null;          // matched against settings.projects (+ aliases)
  kind: "text" | "teams" | "email" | "eml" | "msg" | "docx" | "xlsx" | "pdf" | "image"
      | "rfi_log" | "change_log" | "meeting_minutes";
  title: string;                   // subject, file name, or first line
  source_date: string | null;      // when the thing happened (email date, Teams timestamp, RFI date)
  captured_at: string;             // when you dropped it
  text: string;                    // extracted text used for AI
  file_ref?: string;               // IndexedDB blob key
  content_hash: string;            // dedupe on re-drop
  parent_id?: string;              // an email chain splits into children
  people: string[];                // names detected
  triage?: FeedTriage;             // AI output
  status: "new" | "triaged" | "covered" | "archived";
  covered_in_meeting?: string;     // meeting id that consumed it
}

interface FeedTriage {
  summary: string;                 // 1-2 lines
  include_in_meeting: boolean;
  include_reason: string;
  agenda_section: string | null;   // best-matching heading in the living agenda
  topics: string[];
  decisions: string[];
  open_questions: string[];
  dates: { label: string; date: string }[];   // "IFC pushed to 9/30"
  actions: FeedAction[];
}

interface FeedAction {
  title: string;
  owner: string | null;            // person name, "ITC", "BMcD", or null
  court: "mine" | "theirs" | "team";
  due_at: string | null;
  follow_up_by: string | null;
  linked_task_id?: string;         // set once turned into an Inbox task
}

interface LivingAgenda {
  project: string;
  sections: { id: string; heading: string; bullets: AgendaBullet[] }[];
  last_meeting_at: string | null;
  snapshots: { meeting_id: string; date: string; markdown: string }[];
}

interface AgendaBullet {
  id: string;
  text: string;
  depth: number;                   // preserves your nested bullet style
  added_at: string;
  source_item_ids: string[];       // provenance back to the feed
  stale?: boolean;                 // AI flag: no update in N weeks
}
```

### 1.5 The two importers that earn their keep

**RFI log importer.** Detects the sheet by its header row (`RFI #`, `Resolved?`,
`Date Requested`, `Requested Return Date`, `RFI Directed To:`, `Information Requested`,
`Response`). Each row becomes a feed item keyed by `project + RFI #`. On every re-upload
it diffs against the last import: new rows, rows whose `Resolved?` flipped, rows whose
`Response` changed. Only the diff goes to triage. Open RFIs with a `Requested Return Date`
automatically become "waiting on ITC" actions with that date as `follow_up_by`. The
two internal-only columns are parsed but tagged so they never appear in anything you
copy out. Today's log has 9 open RFIs, 5 of them with a 9/30 return date. That is a
ready-made "Open RFIs" section for your next meeting with zero typing.

**Change log importer.** Same idea for the sheet in the screenshot (`Project Scope
Change #`, `Date ITC Notified`, `Description`, `Estimated Hours`, `Notice to Proceed`,
`Comments`). Items with NTP `Pending` or blank become "waiting on ITC" actions.

**Company minutes importer.** Your firm's AI minutes (.docx) have a stable structure:
Decisions Made, Risks/Issues Raised, and an Action Items table. Decisions and risks
become triage input; the table rows become `FeedAction`s with owner filled in. Note the
tool sometimes puts the room name in the Owner column ("Conf Room, 93-145 19"), so the
importer maps that to `owner = null, court = "mine"` for you to confirm.

### 1.6 AI routes (server, OpenAI, same pattern as the existing routes)

| Route | Input | Output | Purpose |
|---|---|---|---|
| `POST /api/ai/triage_item` | item text (or image), project context, current agenda headings, list of known people | `FeedTriage` | Runs once per feed item on drop |
| `POST /api/ai/prep_meeting` | living agenda, all NEW triaged items since last meeting, open tasks for the project, open "waiting on" actions | proposals: `{ insert: [{section, bullet, source_ids}], new_sections: [...], stale: [bullet_ids], waiting_on: [...], task_suggestions: [...] }` | The weekly prep |
| `POST /api/ai/draft_nudge` | one waiting-on action + its source item | short Teams/email message | One-click "poke Lake about the sync breaker rating" |

All three keep the existing rules: AJV-validated JSON, `X-No-Train`, rate limited,
project list injected from settings. Redaction stays opt-in as it is today because
names are the whole point of the owner field.

Long inputs: email chains are split before triage so each message is small. Spreadsheets
send only the diff. A single docx or pdf over roughly 12k tokens is chunked by heading
and triaged per chunk, then merged.

### 1.7 Screens

1. **Feed page** (`/feed`). Left: project selector and the dated feed for that project,
   newest first, each item showing kind icon, title, source date, one-line summary, a
   `Meeting` chip when `include_in_meeting` is true, and owner chips for its actions.
   Right: the universal drop/paste panel (see 2.1). Filter chips: New / Covered / All.
2. **Meeting Prep page** (`/meetings/[project]`). The living agenda rendered as your
   nested outline. After "Prep", proposed insertions appear inline in a highlighted color
   under their heading with accept / edit / reject controls and a "why" tooltip pointing to
   the source item. A right rail lists "Waiting on" grouped by person, and suggested tasks
   with one-click add. Footer: "Finalize meeting" and "Copy outline" (plain text with
   your indentation style, so it pastes cleanly into Teams, OneNote or Word).
3. **Court view** (`/court`). Every open action and follow-up task across all projects,
   grouped by person, with days waiting and a nudge button. Detailed in 2.2.

### 1.8 Reducing drop friction (you said tens of times a day)

- **Drop or paste anywhere.** A document-level `dragover`/`drop`/`paste` listener on the
  app shell. Any page, any time. A small toast confirms "Added to Cannoli feed" and offers
  "change project" if detection was uncertain.
- **Project auto-detection with aliases.** `ProjectMeta` gains `aliases: string[]`
  (`Cannoli` = `A0007085`, `198694`, `Panattoni`, `SNAP`). Detection is a local string
  match first, AI second. The 27% null-project rate is mostly an alias problem.
- **Keyboard.** `Ctrl+Shift+V` opens the paste panel with the clipboard already in it and
  focus on the project selector. `Enter` saves.
- **Multi-file drops** process in parallel with the existing `runWithPool`.
- **PWA file handler.** Add `file_handlers` to the manifest for `.eml`, `.msg`, `.docx`,
  `.xlsx`, `.pdf`. On Windows with the PWA installed, "Open with Tidy" appears in
  Explorer and Outlook's save dialog. Worth trying, no downside if the laptop policy
  blocks it.
- **Outlook Quick Step.** Not app code, but a one-time setup on your laptop: a Quick Step
  that saves the selected messages to a `Tidy Drop` folder, so end of day you drag the
  whole folder in. Pair it with the direct Outlook-to-browser drag test above.
- **Dedupe by content hash** so re-dropping the same chain or re-uploading the same log
  is a no-op instead of noise.

---

## 2. Three improvements to the existing app

### 2.1 One universal capture box (replaces Inline Capture + Email Drop as separate things)

**Problem.** Task creation dropped to 4 a month because the current capture wants one
task per line, cleanly phrased. Real input is a Teams message, a paragraph, or an email.

**Change.** One box, on the Inbox and as a global overlay, that accepts anything (text,
files, images). A cheap local classifier picks a path: short imperative lines go straight
to `clean_task` as today; anything longer or any file goes into the project feed, and the
feed triage produces tasks as a by-product. You never decide "is this a task or a
document" up front. Existing `InlineCapture`, `EmailDropZone` and `EmailActionItems`
become internal pieces of this one component.

**LLM involvement.** `clean_task` gets the contacts registry and project aliases injected
(both new settings). Multi-task detection: a pasted paragraph that contains three asks
returns three tasks, using the existing `subtasks` split logic but promoted to top level.

### 2.2 Court view: owner and waiting-on as first-class data

**Problem.** 42% of your tasks are follow-ups, and today the only signal is a status the
app is not using (0 follow-up items) plus a `contact` string on email-derived tasks only.

**Change.**
- `CleanTaskResponse` and `InboxItem` gain `owner: string | null` and
  `court: "mine" | "theirs" | "team"`, plus `waiting_since` and `follow_up_by`.
  `email_context.contact` migrates into `owner`.
- Settings gains a **contacts registry**: name, org (BMcD / ITC / vendor), role,
  projects, and aliases ("Lake" = "Lake Ashcroft" or whatever his full name is). The AI
  gets this list, so "Josh to follow up with Lake" resolves to two known people.
- **Court view page**: columns per person, cards per open item, sorted by days waiting,
  with the project tag. A "Mine" column is your own to-do. A "Team" column is for items
  owned by the project team collectively (the Q3/Q4 schedule items in your notes).
- **Nudge drafts**: one click produces a short Teams or email message from the source
  item, ready to paste.
- The existing `follow-up` status stays as the storage value but the UI labels it
  "Waiting on {owner}" so it reads correctly.

### 2.3 Project Pulse: LLM over the data you already have

**Problem.** Weekly summary and Focus are abandoned because they only look at tasks, and
tasks are only 10% of what you know about a project. Project milestones in settings are
stale because updating them is manual.

**Change.** A per-project brief, generated on demand or every Monday via the existing
`DigestScheduler`, that reads tasks + feed + living agenda and returns:
- What closed this week, what opened, what is stuck (no touch in 14+ days).
- **Milestone drift detection**: the AI extracts dated commitments from the feed ("IFC
  pushed to 9/30", "Submittal date for ITC - 9/23", "Q6 starting 9/23") and proposes
  updates to `ProjectMeta.llmr_due / ifr_due / ifc_due`, plus a new free-form
  `milestones[]` list for the Q3/Q4/Q6 style dates that do not fit the three fixed
  fields. You confirm with one click. Schedules stop being stale without you editing
  a table.
- **Hygiene pass**: proposes a project for each of the 106 null-project tasks using the
  aliases and contacts, flags likely duplicates (the "follow up with Madison" chain in the
  older analysis), and suggests closing tasks that have had no activity in 60 days.
- **Ask the data**: a single text box, "what is open for Cannoli waiting on ITC", answered
  from local data with a small tool-style prompt (filter, then summarize). Cheap, and it
  is the fastest way to prep for a call.

---

## 3. Build order

Each phase ships on its own and is useful alone.

| Phase | Scope | Rough size |
|---|---|---|
| 1. Feed foundation | IndexedDB store, `FeedItem`, universal drop/paste panel, text + Teams + email-chain parsers, `.eml/.msg` reuse, project aliases, content hashing, `/feed` page, `triage_item` route, backup/export of feed | Large. This is the base everything else needs |
| 2. Meeting Prep | Living agenda model and outline parser (seed from your pasted notes), `prep_meeting` route, proposal review UI, finalize + copy-out, task creation from accepted actions | Large |
| 3. Court view | owner/court fields + migration, contacts registry in settings, `/court` page, nudge drafts | Medium |
| 4. Spreadsheet and doc importers | SheetJS + row diffing for RFI log and change log, mammoth for docx with action-table extraction, pdfjs | Medium |
| 5. Project Pulse | brief generation, milestone drift proposals, hygiene pass, ask-the-data | Medium |
| 6. Polish | PWA file handlers, image triage, keyboard shortcuts, `Ctrl+Shift+V` overlay | Small |

Phase 1 plus 2 is the thing you asked for. Phase 3 is the "whose court" ask. Phase 4 is
what makes the RFI log and change log free instead of retyped. Phase 5 is the "more LLM
over the data" ask.

New dependencies, all client-side and small: `idb`, `mammoth`, `xlsx`, `pdfjs-dist`.
No new server dependencies. Existing route pattern (AJV + OpenAI JSON mode + rate limit)
is reused for the three new routes.

---

## 4. Decisions I made on your behalf, and what to push back on

- **Client-side parsing, not server.** Chosen for privacy and for the Vercel body limit.
  The cost is a slightly bigger JS bundle (pdfjs is the heavy one, lazy-loaded).
- **IndexedDB for the feed, localStorage for tasks.** Avoids a risky migration of what
  already works. Backup/export covers both.
- **Living agenda edited by proposals, not regenerated.** This is the strongest opinion
  in the plan. If you would rather have the AI write a fresh document each week from
  scratch, say so, but I think you would lose the continuity your published notes have.
- **`gpt-4o-mini` stays the model.** Triage volume will be tens of calls a day, and this
  work is extraction, not reasoning. If prep quality is not good enough, only the
  `prep_meeting` route should move to a bigger model.
- **Rate limits.** The current 5 per minute on `parse_email` will block a 20-file drop.
  The new triage route needs about 30 per minute with client-side queuing.
- **Teams paste is heuristic.** Teams changes its copy format without notice. The parser
  degrades to "one item, whole text" rather than failing, so the worst case is a less
  precise date, never a lost item.

Open questions for you, none blocking Phase 1:
1. Is the meeting cadence per project stored in settings (weekly vs biweekly), so the
   "stale" threshold and the Pulse schedule can follow it?
2. Do you want the copied-out outline in plain text with indentation (pastes into
   Teams/OneNote) or Markdown (pastes into Word via Paste Special)? Both is cheap.
3. Should feed items be shareable with your team at some point? If yes, the IndexedDB
   choice still works but a later sync layer should be designed in now rather than
   bolted on.
