# Improvement Recommendations for Tidy-Tasks

Based on the analysis of 104 tasks, here are specific recommendations to improve the task cleaning AI and the tool itself.

---

## Priority 1: Fix Project Matching (High Impact)

### Problem
30% of tasks have `project: null` when they clearly mention a project name. The AI fails to match variations like:
- "the tompkins project" → `null` (should be `Tompkins`)
- "whiskey project grounding" → `null` (Whiskey not in project list)
- "for Northwest" → `null` (case/phrasing mismatch)

### Solution 1A: Improve Prompt Instructions

**Current prompt section:**
```
PROJECT MATCHING (CRITICAL): The "project" field MUST be EXACTLY one of: [...]
```

**Recommended change in `/app/api/ai/clean_task/route.ts`:**

```typescript
const projectMatchingPrompt = projects.length > 0 ? `
PROJECT MATCHING RULES:
1. Available projects: ${JSON.stringify(projects.map(p => p.name))}
2. FUZZY MATCH: Match case-insensitively. "tompkins" → "Tompkins", "NORTHWEST" → "Northwest"
3. PARTIAL MATCH: "the Tompkins mega project" → "Tompkins"
4. KEYWORD MATCH: If task mentions project deliverables (IFC, IFR, LLMR, change log, grounding) AND a project name appears anywhere, use that project
5. INFER FROM CONTEXT: If task mentions a known contact associated with a project, consider that project
   Known associations: ${projectContactHints}
6. If NO project can be matched: use null (never invent project names)
7. OUTPUT: Use EXACT case from the project list above
` : '';
```

### Solution 1B: Add Missing Projects to User Settings

Based on task data, prompt user to add:
- **Whiskey** - 10 tasks reference this
- **BMI** - 5 tasks (internal project)
- **Wayne** - 2 tasks
- **Blackstone** - 1 task
- **Warren** - 1 task
- **Oxby** - 1 task

**UI Enhancement:** Show "Suggested Projects" in settings based on unmatched project mentions.

---

## Priority 2: Preserve Task Intent (Critical)

### Problem
The AI sometimes changes the fundamental action of a task:
- "Send out the Jewell Change Log" → "Work with Trinity to estimate the hours..."
- "Review Ben's change log" → "Follow up on the change log for Rahul"

### Solution 2A: Add Intent Preservation Instruction

Add to system prompt:

```
INTENT PRESERVATION (CRITICAL):
- The cleaned title MUST preserve the original ACTION VERB intent
- "Send X" must remain a send/email task, not become "Review X" or "Work on X"
- "Follow up with Person A" must keep Person A as the contact, not switch to Person B
- "Review X" must stay a review task, not become "Send X" or "Create X"
- When in doubt, keep the original phrasing with light cleanup only
- DO NOT infer additional workflow steps unless explicitly stated
```

### Solution 2B: Add Validation Check

In the response processing:

```typescript
function validateIntentPreserved(rawText: string, cleanedTitle: string): boolean {
  const rawVerb = extractActionVerb(rawText.toLowerCase());
  const cleanedVerb = extractActionVerb(cleanedTitle.toLowerCase());

  const verbGroups = {
    send: ['send', 'email', 'deliver', 'submit'],
    review: ['review', 'check', 'look at', 'examine'],
    followUp: ['follow up', 'check in', 'reach out', 'contact'],
    create: ['create', 'make', 'build', 'work on', 'write'],
    setup: ['setup', 'set up', 'schedule', 'arrange']
  };

  // Ensure verb stays in same group
  for (const group of Object.values(verbGroups)) {
    if (group.includes(rawVerb) && !group.includes(cleanedVerb)) {
      console.warn(`Intent changed: ${rawVerb} → ${cleanedVerb}`);
      return false;
    }
  }
  return true;
}
```

---

## Priority 3: Calibrate Importance Scoring

### Problem
58% of tasks score between 60-80, clustering around 70 (the "safe" default).

### Solution 3A: Explicit Scoring Guidance

Replace vague importance instruction with:

```
IMPORTANCE SCORING (0-100):
Use the FULL range. Most tasks should NOT be 60-80.

Scoring Guide:
- 90-100: Deadline this week, client-facing, blocks others, contractual obligation
- 70-89: Deadline next week, internal milestone, moderately urgent
- 50-69: No hard deadline, nice-to-have this week, low stakes
- 30-49: Backlog item, someday/maybe, no time pressure
- 0-29: Optional, exploratory, personal development

Examples from your workflow:
- "Send IFC deliverable to client" = 95 (deadline + client)
- "Follow up with vendor on quote" = 55 (no deadline, just tracking)
- "Update meeting notes" = 40 (low urgency, internal)
- "Get Minnesota PE license" = 35 (long-term, no deadline)

Avoid defaulting to 70. If uncertain, score LOWER rather than higher.
```

### Solution 3B: Learn from Historical Data

Add a feedback mechanism:

```typescript
// Track importance accuracy
interface ImportanceFeedback {
  taskId: string;
  aiScore: number;
  userAdjusted: number; // if user manually changes
  wasOnTime: boolean;   // if task had due date and was completed on time
}

// Use for prompt calibration
const avgDrift = calculateImportanceDrift(feedbackHistory);
// If users consistently lower AI scores, adjust prompt
```

---

## Priority 4: Add Contact Awareness

### Problem
The AI doesn't know the relationships between people and projects, leading to:
- Wrong person associated with task
- Missing context about who does what

### Solution 4A: Contact Registry in Settings

Add to work settings:

```typescript
interface Contact {
  name: string;
  role?: string;
  associatedProjects?: string[];
  notes?: string;
}

// Example from your data:
contacts: [
  { name: "Madison", role: "PM", associatedProjects: ["Kerswill", "Whiskey"], notes: "Geotech reports, grounding files" },
  { name: "Nick", role: "Client", associatedProjects: ["Jewell", "Northwest"], notes: "ITC PM" },
  { name: "Devin", role: "Client", associatedProjects: ["Whiskey"], notes: "NEER team" },
  { name: "Chase", role: "Reviewer", notes: "Change log approver" },
  { name: "Rahul", associatedProjects: ["Tompkins"], notes: "Point lists, geotech" }
]
```

### Solution 4B: Inject Contact Context into Prompt

```typescript
const contactContext = contacts.length > 0 ? `
KNOWN CONTACTS:
${contacts.map(c => `- ${c.name}${c.role ? ` (${c.role})` : ''}${c.associatedProjects?.length ? `: works on ${c.associatedProjects.join(', ')}` : ''}`).join('\n')}

Use this to:
1. Correctly spell contact names
2. Infer project if contact is mentioned but project isn't
3. Add context to notes_append when relevant
` : '';
```

---

## Priority 5: Improve Subtask Generation

### Problem
Only 15% of tasks have subtasks, and complex tasks often lack breakdown.

### Solution 5A: Subtask Triggers in Prompt

```
SUBTASK GENERATION:
Generate subtasks when:
- Task involves multiple people or approvals
- Task mentions "then" or sequential steps
- Task is a proposal, report, or deliverable (break into: research, draft, review, finalize)
- Effort is 30+ minutes
- Task explicitly lists steps in raw text

Keep subtasks:
- Actionable (start with verb)
- Atomic (one thing each)
- 2-5 items (not too granular)

DO NOT generate subtasks when:
- Task is a simple follow-up or email
- Task is < 15 minutes effort
- Breakdown would be obvious/trivial
```

### Solution 5B: Better Raw Text Parsing

Detect patterns like:
```typescript
const hasSequence = /\bthen\b|first.*then|after.*send|before.*do/i.test(rawText);
const hasMultiplePeople = (rawText.match(/\b[A-Z][a-z]+\b/g) || []).length > 1;
const hasList = rawText.includes(',') && rawText.split(',').length > 2;

if (hasSequence || hasMultiplePeople || hasList) {
  // Signal to AI that subtasks are expected
  prompt += '\nThis task appears to have multiple steps. Generate appropriate subtasks.';
}
```

---

## Priority 6: Detect Follow-up Chains

### Problem
You have many related follow-ups that could be consolidated:
- "Follow up with Madison on geotech" (12/18)
- "Follow up with Madison on geotech addendum" (12/29)

### Solution 6A: Follow-up Detection

```typescript
interface FollowUpChain {
  contact: string;
  topic: string;
  tasks: Task[];
  suggestConsolidate: boolean;
}

function detectFollowUpChains(tasks: Task[]): FollowUpChain[] {
  const followUps = tasks.filter(t =>
    t.result.title.toLowerCase().includes('follow up') ||
    t.result.tags.includes('follow-up')
  );

  // Group by contact + similar topic
  // Suggest consolidation if 2+ follow-ups within 2 weeks on same topic
}
```

### Solution 6B: UI Enhancement

Show in Inbox/Focus view:
```
⚠️ Related follow-ups detected:
  - Follow up with Madison on geotech report (Dec 18)
  - Follow up with Madison on geotech addendum (Dec 29)
  [Consolidate] [Keep separate]
```

---

## Priority 7: Fix Status Semantics

### Current Issue
"follow-up" status is used inconsistently - sometimes for waiting tasks, sometimes for actual follow-up actions.

### Solution: Clarify Status Model

```typescript
enum TaskStatus {
  inbox = 'inbox',       // Unprocessed
  active = 'active',     // Ready to work on
  waiting = 'waiting',   // Blocked on someone else (rename from follow-up)
  snoozed = 'snoozed',   // Deferred
  done = 'done'          // Completed
}

interface WaitingMetadata {
  waitingOn: string;     // Contact name
  expectedBy?: string;   // ISO date
  reminderAt?: string;   // ISO date to re-check
}
```

---

## Priority 8: Timezone Consistency

### Problem
Some tasks have `+00:00`, others have `-06:00`.

### Solution
Force timezone in date normalization:

```typescript
function normalizeDate(dateStr: string, userTz: string): string {
  if (!dateStr) return null;

  // Parse in user's timezone
  const parsed = DateTime.fromISO(dateStr, { zone: userTz });

  // If no time, set to end of work day
  if (!dateStr.includes('T')) {
    return parsed.set({ hour: 17, minute: 0 }).toISO();
  }

  // Ensure output uses user's timezone offset
  return parsed.setZone(userTz).toISO();
}
```

---

## Priority 9: Tag Normalization

### Problem
Inconsistent tags: "BMI" vs "bmi", "follow-up" vs "followup", project names as tags.

### Solution

```typescript
function normalizeTags(tags: string[], projects: string[]): string[] {
  return tags
    .map(t => t.toLowerCase().trim())
    .filter(t => !projects.map(p => p.toLowerCase()).includes(t)) // Remove project names
    .map(t => TAG_ALIASES[t] || t) // Normalize aliases
    .filter((t, i, arr) => arr.indexOf(t) === i); // Dedupe
}

const TAG_ALIASES: Record<string, string> = {
  'followup': 'follow-up',
  'follow up': 'follow-up',
  'comms': 'communication',
  'comm': 'communication',
  'mtg': 'meeting',
  // etc.
};
```

---

## Priority 10: Learn from Completed Tasks

### Problem
No feedback loop - AI can't learn from user corrections.

### Solution: Capture Learning Signals

```typescript
interface TaskFeedback {
  taskId: string;
  original: CleanTaskResponse;
  userEdits: Partial<CleanTaskResponse>;
  wasCompleted: boolean;
  actualEffort?: number;  // If user tracks actual time
}

// Use for:
// 1. Effort estimation calibration (predicted vs actual)
// 2. Importance calibration (adjusted scores)
// 3. Project matching improvements (null → user-set project)
// 4. Contact-project associations
```

---

## Implementation Roadmap

### Phase 1: Quick Wins (This Week)
- [ ] Add missing projects to settings (Whiskey, BMI, Wayne, Blackstone)
- [ ] Update prompt with intent preservation rules
- [ ] Add importance scoring guide to prompt
- [ ] Fix timezone normalization

### Phase 2: Core Improvements (Next 2 Weeks)
- [ ] Enhance project matching with fuzzy logic
- [ ] Add contact registry to settings
- [ ] Improve subtask generation triggers
- [ ] Implement tag normalization

### Phase 3: Advanced Features (Month 2)
- [ ] Follow-up chain detection
- [ ] Learning from user corrections
- [ ] "Waiting" status with metadata
- [ ] Suggested project detection from unmatched mentions

---

## Metrics to Track

After implementing changes, monitor:

1. **Project Match Rate** - Target: >90% (currently ~70%)
2. **Importance Distribution** - Target: <30% in 60-80 range (currently 58%)
3. **Intent Preservation** - Target: <5% action verb changes
4. **Subtask Generation** - Target: >40% for 30+ min tasks
5. **User Edit Rate** - Fewer manual corrections = better AI

---

## Appendix: Prompt Template v2

Here's the recommended updated system prompt:

```
You are a task cleanup assistant. Normalize messy task input into structured data.

TODAY: ${today} (${dayOfWeek})
TIMEZONE: ${timezone}
END OF WORK DAY: ${endOfDay}

=== CORE RULES ===

1. TITLE: Use verb-first, active voice. Keep concise (5-12 words).

2. INTENT PRESERVATION (CRITICAL):
   - Keep the original ACTION intent: "Send X" stays send, "Review X" stays review
   - Keep the original PERSON: "Follow up with Madison" must involve Madison
   - DO NOT add workflow steps not mentioned in the input
   - When uncertain, apply minimal cleanup only

3. PROJECT MATCHING:
   Available: ${JSON.stringify(projectNames)}
   - Match case-insensitively, output exact case from list
   - "the tompkins project" → "Tompkins"
   - If no match found, use null (never invent)
   ${contactProjectHints}

4. IMPORTANCE (0-100, use FULL range):
   90-100: This week deadline, client-facing, blocking
   70-89: Next week deadline, internal milestone
   50-69: No hard deadline, nice-to-have
   30-49: Backlog, someday/maybe
   0-29: Optional, exploratory
   → Avoid defaulting to 70. Score LOWER if uncertain.

5. SUBTASKS:
   Generate when: multiple steps, "then" sequences, 30+ min effort, multiple approvals
   Skip when: simple follow-up, < 15 min, obvious single action
   Format: 2-5 actionable items, verb-first

6. DATES:
   - "next [day]" = that day NEXT week
   - "this [day]" / "[day]" = upcoming occurrence
   - "EOW" / "end of week" = ${eowAnchor}
   - Always use ISO 8601 with timezone: ${timezone}

=== USER CONTEXT ===
${roleContext}
${workContext}

=== OUTPUT FORMAT ===
Return ONLY valid JSON:
{
  "title": "string",
  "due_at": "ISO8601 or null",
  "scheduled_for": "ISO8601 or null",
  "effort_min": 5|15|30|60|90|120,
  "energy": "low"|"med"|"high",
  "tags": ["lowercase", "no-project-names"],
  "project": "ExactCaseFromList or null",
  "subtasks": ["Verb-first step"],
  "importance": 0-100,
  "notes_append": "string or null"
}
```
