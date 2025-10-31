## 🧠 tidy-001 — SPEC.md

**Purpose**
A lightweight personal task tracker with OpenAI API integration that cleans, organizes, and prioritizes tasks into a daily Focus Queue.

---

### 1️⃣ MVP Scope
**Core loop**
1. **Capture:** User adds messy tasks quickly.
2. **Clean (AI):** Normalize, structure, tag, and split tasks.
3. **Plan:** Generate prioritized Focus Queue (Now / Next / Later).
4. **Do:** Start tasks from the Focus Queue.
5. **Review:** Daily + weekly check-ins (rollover / archive).

**AI endpoints**
- `/api/ai/clean_task` → single/batch cleanup
- `/api/ai/prioritize_tasks` → reorder and score list

**Storage**
- Local SQLite (or Core Data)
- Tables: `tasks`, `projects`, `tags`, `task_tags`, `settings`
- No server required in v1.

---

### 2️⃣ Data Model (MVP)

**Task**
| Field | Type | Notes |
|-------|------|-------|
| id | string | UUID |
| title | string | Verb-first task name |
| notes | text | Freeform |
| status | enum | inbox / active / done / snoozed |
| priority_score | int | 0–100 |
| bucket | enum | now / next / later / backlog |
| importance | int | 0–100 |
| effort_min | int | 5 / 15 / 30 / 60 / 120 |
| energy | string | low / med / high |
| due_at | datetime | nullable |
| scheduled_for | datetime | nullable |
| project | string | nullable |
| tags | array | text[] |
| created_at | datetime | auto |
| updated_at | datetime | auto |

---

### 3️⃣ AI Integration

**A. Clean Task**

- **Purpose:** Parse messy input into structured JSON.
- **Call:** `POST /api/ai/clean_task`
- **Body Example:**
```json
{ "raw_text": "email brian about easement before Friday 30 min" }
```

- **System prompt:**

```
Normalize task text. Write verb-first titles, parse natural language dates, infer effort (5–120 min), energy (low/med/high), importance (0–100), tags, and project if clear. Split into subtasks when compound. Return strict JSON.
```

- **Response Example:**

```json
{
  "title": "Email Brian about easement language",
  "due_at": "2025-11-03",
  "effort_min": 30,
  "energy": "low",
  "tags": ["email","client","easement"],
  "project": "Shawnee-Walker Segment 1",
  "subtasks": ["Draft email bullets","Attach grading sketch","Send and set follow-up reminder"],
  "importance": 78,
  "notes_append": "Mentions energized work; attach grading notes."
}
```

---

**B. Prioritize Tasks**

- **Purpose:** Compute priority scores & buckets given today's context.
- **Call:** `POST /api/ai/prioritize_tasks`
- **Body Example:**

```json
{
  "date": "2025-11-03",
  "energy": "med",
  "tasks": [ ... ],
  "max_focus_minutes": 240
}
```

- **System prompt:**

```
You are a planning assistant. Given tasks + today's context (time windows, energy), assign priority_score (0–100) and bucket ∈ {Now, Next, Later, Backlog}. Keep total planned focus ≤ 4h. Include a short rationale.
```

- **Response Example:**

```json
[
  { "id": "t_123", "priority_score": 86, "bucket": "Now", "rationale": "Due tomorrow; low effort; unblocks permit package." }
]
```

---

### 4️⃣ App Views

| Screen | Purpose | Key Elements |
|--------|---------|--------------|
| Inbox | Raw captured items | List, "Clean All with AI" button |
| Task Detail | Edit + view rationale | Title, notes, subtasks, priority bar |
| Today (Focus Queue) | 5 active tasks | Big "Start" button, time left pill |
| Review | End-of-day/week reflection | Quick archive/defer suggestions |

---

### 5️⃣ Privacy & "No-Train" Policy

- Every AI call flagged no-train → not used for model training.
- Automatic redaction of emails, phone numbers, proper names before requests.
- All data stored locally unless user syncs via iCloud/Drive (v2).
- Clear copy: "Your data never leaves your device except for single AI processing."

---

### 6️⃣ Prioritization Formula (v1)

```
score = U*0.4 + I*0.4 + M*0.1 + F*0.1 – O
```

| Symbol | Meaning | Range |
|--------|---------|-------|
| U | Urgency (time to due date) | 0–100 |
| I | Importance (AI/user) | 0–100 |
| M | Momentum (project streak) | 0–20 |
| F | Fit (energy/time alignment) | 0–20 |
| O | Overload penalty | 0–30 |

**Buckets:**
- 80–100 → Now
- 50–79 → Next
- 20–49 → Later
- <20 → Backlog

---

### 7️⃣ Metrics (Success Criteria)

- 85% AI cleaning accuracy (title/date/effort)
- Day plan generated in ≤ 3 s
- 5 completed tasks/day for 3 days w/o manual reorder

---

### 8️⃣ Out-of-Scope (v1)

- Teams/collab, attachments, full calendar sync, templates, analytics.
- **Later:**
  - v1.1 → Energy slider, batch clean.
  - v1.2 → Project momentum.
  - v2 → Sync + widgets.
  - v3 → Teams & analytics.

---

### 9️⃣ Tech Notes

- Frontend: Next.js 14 + TS
- DB: SQLite local
- AI: OpenAI GPT-4o Mini / JSON mode
- Validation: AJV
- Timezone default: America/Phoenix

---

### 10️⃣ Prompts (ready to use)

**Clean Task — system**
```
Normalize tasks. Prefer verb-first titles. Parse natural language dates relative to {{today}}. Estimate effort_min ∈ {5,15,30,60,120}. Infer importance (0–100). Identify tags/projects from text. Split into atomic subtasks if needed. Return STRICT JSON.
```

**Prioritize — system**
```
You are a planning assistant. Given tasks + today's context (time windows, energy), assign priority_score (0–100) and bucket ∈ {Now, Next, Later, Backlog}. Respect caps on planned focus time (default 4h). Provide a short rationale.
```
