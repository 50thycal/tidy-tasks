# Email Action Items Feature - Implementation Plan

## Overview
Add an "Email Drop" feature to Tidy Tasks that lets you drag-and-drop (or paste/upload) email files, automatically extracts action items using AI, identifies who you need to follow up with, and creates tasks with follow-up reminders — all integrated with the existing follow-up status system.

---

## How It Works (User Flow)

1. **Navigate** to new `/email` page (linked from sidebar)
2. **Drop emails** onto a drag-and-drop zone (supports `.eml` files, `.txt` exports, or raw paste of email text)
3. **AI parses** each email and extracts:
   - Action items for YOU (things you need to do)
   - Action items for OTHERS (ball in their court — auto-tagged as follow-up)
   - Suggested follow-up date (when to check back if no response)
   - Contact name and email subject for context
4. **Review** extracted tasks in a results panel (similar to Batch Capture)
5. **Add to inbox** — "your" action items go to Active, "their" items go to Follow-up with a due date as the follow-up reminder

---

## Technical Plan

### 1. New API Route: `/api/ai/parse_email`
**File:** `app/api/ai/parse_email/route.ts`

- Accepts `{ email_text: string, today: string, timezone: string }`
- Uses a specialized system prompt that instructs the AI to:
  - Identify the sender, recipients, subject, and date
  - Extract action items categorized as `"mine"` or `"theirs"`
  - For each action item: title, effort estimate, importance, suggested due/follow-up date, contact person
  - Detect urgency signals ("ASAP", "by Friday", "please confirm")
- Returns structured JSON:
  ```ts
  {
    sender: string,
    subject: string,
    email_date: string | null,
    action_items: Array<{
      title: string,           // verb-first, like existing tasks
      owner: "mine" | "theirs",
      contact: string,         // who to follow up with
      due_at: string | null,   // ISO date
      follow_up_by: string | null,  // suggested follow-up date
      effort_min: 5|15|30|60|90|120,
      energy: "low"|"med"|"high",
      importance: number,      // 0-100
      tags: string[],
      project: string | null,
      notes: string | null,    // context from email
    }>
  }
  ```
- Reuses existing patterns: rate limiting, settings extraction, project matching, AJV validation
- Uses same OpenAI API setup as `clean_task`

### 2. Email Parser Utility
**File:** `src/lib/emailParser.ts`

- `parseEmlFile(file: File): Promise<string>` — extracts plain text body from `.eml` files (RFC 2822 format: split headers from body at first blank line, handle basic MIME)
- `parseTextFile(file: File): Promise<string>` — reads `.txt` files as-is
- `sanitizeEmailText(text: string): string` — strips excessive whitespace, signature blocks, forwarded headers noise
- Keeps it simple: no heavy MIME library needed, just basic header/body splitting since we're sending to AI anyway

### 3. Email Drop Page
**File:** `app/email/page.tsx`

- **Drop Zone Component** (`app/components/EmailDropZone.tsx`):
  - Large drag-and-drop area using native HTML5 drag/drop API (no new dependency needed — your app already has `@dnd-kit` but native HTML5 DnD is simpler for file drops)
  - Visual states: idle, drag-over (highlighted), processing
  - Accepts: `.eml`, `.txt`, `.msg` files, or paste from clipboard
  - Also has a "paste email text" textarea as fallback (click to expand)
  - Multiple files supported — processes sequentially

- **Results Panel** (`app/components/EmailActionItems.tsx`):
  - Groups results by email (sender + subject header)
  - Within each email, splits into two sections:
    - **"Your Action Items"** — tasks for you to do
    - **"Waiting On"** — ball in their court, shows contact name + follow-up date
  - Each item is editable (title, due date, project) like existing BatchResults
  - Bulk actions: "Add All to Inbox", "Add Selected"
  - "Your" items default to Active status; "Waiting On" items default to Follow-up status

### 4. Data Model Extension
**File:** `src/lib/clientStore.ts` (minor additions)

- Add optional `email_context` field to `InboxItem`:
  ```ts
  email_context?: {
    sender: string,
    subject: string,
    email_date: string | null,
    contact: string,        // person to follow up with
    follow_up_by: string | null,  // reminder date
  }
  ```
- This enriches follow-up items with email context so you can see WHO you're waiting on and WHEN to ping them
- Existing follow-up functionality continues to work unchanged

### 5. Follow-up Enhancement
**File:** `app/components/TaskCard.tsx` (small addition)

- When a task has `email_context`, show a small "Waiting on: [contact]" badge
- If `follow_up_by` date has passed, highlight it (overdue follow-up visual cue)
- This surfaces in the existing inbox view — no new page needed for reviewing follow-ups

### 6. Sidebar Navigation
**File:** `app/components/Sidebar.tsx`

- Add "Email Drop" link to sidebar navigation (mail icon)
- Positioned after "Capture" in the nav order

---

## File Summary

| File | Action | Description |
|------|--------|-------------|
| `app/api/ai/parse_email/route.ts` | **New** | AI endpoint for email parsing |
| `src/lib/emailParser.ts` | **New** | .eml/.txt file parsing utilities |
| `app/email/page.tsx` | **New** | Email drop page |
| `app/components/EmailDropZone.tsx` | **New** | Drag-and-drop file zone component |
| `app/components/EmailActionItems.tsx` | **New** | Results display for extracted actions |
| `src/lib/clientStore.ts` | **Edit** | Add `email_context` to InboxItem type |
| `app/components/TaskCard.tsx` | **Edit** | Show email contact/follow-up badge |
| `app/components/Sidebar.tsx` | **Edit** | Add Email Drop nav link |
| `types/api.d.ts` | **Edit** | Add ParseEmailRequest/Response types |

---

## What This Does NOT Include (future iterations)
- Direct email account integration (IMAP/Gmail API) — this is a manual drop approach first
- Automatic email polling
- Reply drafting
- Thread tracking across multiple emails

---

## Key Design Decisions
1. **Drag-and-drop + paste** covers the most use cases without needing email API integration. You can save emails as `.eml` from any email client and drop them in, or just copy-paste the text.
2. **"mine" vs "theirs" split** is the core value — AI categorizes who owns each action so you immediately know what to work on vs what to track.
3. **Reuses existing follow-up status** — no new status needed, just enriched metadata.
4. **No new dependencies** — native HTML5 file drop API, existing OpenAI integration, existing UI patterns.
