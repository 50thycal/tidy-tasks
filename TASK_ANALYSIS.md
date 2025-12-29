# Task Data Analysis Report

**Generated:** 2025-12-29
**Total Tasks Analyzed:** 104
**Date Range:** 2025-11-10 to 2025-12-29

---

## Executive Summary

After analyzing 104 tasks from your tidy-tasks usage, I've identified several key patterns and opportunities for improvement. The main findings are:

1. **Task Type Distribution is Highly Skewed** - 42% of tasks are follow-ups/communication
2. **Project Matching is Inconsistent** - 30% of tasks have `project: null` when they clearly belong to projects
3. **Importance Scoring Lacks Calibration** - Values cluster around 70 with poor differentiation
4. **Subtask Generation is Underutilized** - Only 15% of complex tasks have subtasks
5. **People/Contact Context is Lost** - Frequent contacts aren't leveraged for smarter processing

---

## 1. Task Type Analysis

### Distribution by Task Pattern

| Task Type | Count | Percentage | Example |
|-----------|-------|------------|---------|
| **Follow-up/Check-in** | 28 | 27% | "Follow up with Madison on geotech report" |
| **Send/Email** | 16 | 15% | "Send out the Kerswill change log" |
| **Work on/Create** | 22 | 21% | "Work on the Blackstone Proposal" |
| **Review** | 9 | 9% | "Review Ben's change log for Tompkins" |
| **Setup/Schedule** | 8 | 8% | "Setup a meeting with Anandan" |
| **Reach out/Call** | 12 | 12% | "Call Nick to discuss Jewel project" |
| **Find/Figure out** | 5 | 5% | "Find grounding engineer for Tompkins" |
| **Other** | 4 | 4% | Various one-off tasks |

### Key Insight: Follow-up Heavy Workflow
Your workflow is heavily communication-dependent. 42% of tasks involve reaching out to someone. This suggests the AI should:
- Better categorize follow-ups vs. action items
- Track follow-up chains (multiple follow-ups to same person on same topic)
- Suggest consolidation of related follow-ups

---

## 2. Project Distribution Analysis

### Projects by Task Count

| Project | Tasks | % | Notes |
|---------|-------|---|-------|
| Kerswill | 13 | 12.5% | Most active project |
| Tompkins | 11 | 10.6% | High complexity |
| Whiskey | 10 | 9.6% | Frequent client contact |
| Northwest | 9 | 8.7% | Steady workload |
| Delhi | 6 | 5.8% | - |
| Bass Creek | 3 | 2.9% | - |
| Jewell | 3 | 2.9% | - |
| **null (unassigned)** | **31** | **30%** | **Problem area** |
| Other/One-off | 18 | 17% | BMI, Oxby, etc. |

### Project Matching Failures

These tasks have `project: null` but clearly belong to a project:

1. **"Send out the Kerswill change log"** → Should be `Kerswill`
2. **"Work on estimate and new schedule for Northwest project"** → `Northwest`
3. **"Create Geotech Spec for Northwest Project"** → `Northwest`
4. **"Send out the Wayne REV 1 IFC"** → `Wayne` (not in project list?)
5. **"Notify Devin about insulator order for Whiskey project"** → `Whiskey`
6. **"Set up OneNote for BMI notes"** → Should create `BMI` project?
7. **"Talk to Devin about changing the submittal date for the whiskey project"** → `Whiskey`

### Missing Projects in Settings

Based on task data, these projects appear frequently but aren't in your settings:
- **Whiskey** - 10 tasks (needs to be added)
- **BMI** - 5 tasks (should be tracked as project)
- **Oxby** - 1 task
- **Blackstone** - 1 task
- **Warren** - 1 task

---

## 3. People/Contact Analysis

### Most Frequently Mentioned Contacts

| Person | Mentions | Common Context |
|--------|----------|----------------|
| Madison | 8 | Geotech reports, grounding files |
| Nick | 8 | Jewel/Jewell, Northwest, RFIs |
| Devin | 7 | Whiskey project, client contact |
| Chase | 5 | Change log reviews, approvals |
| Rahul | 4 | Tompkins, geotech reports |
| Anandan | 4 | BMI, security design |
| Shrikant | 3 | Kerswill, grounding design |
| Kennedy | 3 | Tompkins, scheduling |
| Stephen | 3 | Grounding studies |

### Insight: Contact-Project Relationships
The AI could learn these associations:
- **Madison** → Kerswill (geotech), Whiskey (grounding)
- **Nick** → Jewell, Northwest, external client
- **Devin** → Whiskey (NEER team contact)
- **Chase** → Change log approver, QC reviewer
- **Rahul** → Tompkins (point list, geotech)

---

## 4. Importance Score Analysis

### Distribution of Importance Values

```
Score Range | Count | Percentage
----------- | ----- | ----------
0-20        | 4     | 4%
21-40       | 5     | 5%
41-60       | 16    | 15%
61-70       | 38    | 37%      ← Heavy clustering
71-80       | 22    | 21%
81-90       | 10    | 10%
91-100      | 9     | 9%
```

### Problem: Poor Differentiation
- 58% of tasks scored between 60-80
- The AI defaults to ~70 when uncertain
- Tasks marked 100 importance: 9 total (some are trivial like "Send out e-card")

### Calibration Issues Identified

**Over-scored (should be lower):**
- "Send out Anandan's e-card for the Baby" → 100 (should be ~50, personal)
- "Follow up with Madison for open questions on geotech" → 100 (should be ~75)

**Under-scored (should be higher):**
- "Start working on the Blackstone Proposal" → 90 (correct, has deadline)
- "Follow up with Devin and Madison for Whiskey grounding inputs" → 100 (but project is null!)

---

## 5. Effort Estimation Patterns

### Effort Distribution

| Minutes | Count | Percentage | Typical Task Type |
|---------|-------|------------|-------------------|
| 5 | 31 | 30% | Follow-ups, quick emails |
| 15 | 40 | 38% | Reviews, calls |
| 30 | 25 | 24% | Proposals, documents |
| 60 | 7 | 7% | Major work items |
| 90+ | 1 | 1% | Complex planning |

### Observations
- Good spread across effort levels
- 68% of tasks are ≤15 min (matches follow-up heavy workflow)
- Complex work items (proposals, reports) correctly estimated higher

---

## 6. Subtask Generation Analysis

### Subtask Usage

| Has Subtasks? | Count | Percentage |
|---------------|-------|------------|
| No subtasks | 88 | 85% |
| Has subtasks | 16 | 15% |

### Quality of Generated Subtasks

**Good Examples:**
```json
// Task: "Call Nick to Discuss Jewel Project Concerns"
"subtasks": [
  "Explain work that needs to be done",
  "Discuss concerns about additional survey",
  "Discuss expanding construction SOW",
  "Discuss achieving positive drainage"
]
```

**Weak Examples:**
```json
// Task: "Work on Timeline Diagram for BMI"
"subtasks": [
  "Outline Monday Flow",
  "Outline Tuesday Flow",
  "Outline Wednesday Flow",
  "Outline Thursday Flow",
  "Outline Friday Flow"
]
// Too literal - doesn't add value
```

### Tasks That Should Have Subtasks But Don't

1. **"Work on a kick off for the BMI civil kick off"** (has lots of context in raw_text)
2. **"Work on the Blackstone Proposal"** (complex deliverable)
3. **"Create baseline % for BMI projects with Anandan"** (multi-step analysis)

---

## 7. Title Normalization Inconsistencies

### Good Transformations
| Raw Input | Cleaned Title |
|-----------|---------------|
| "need to look at the 60% submittal example" | "Review 60% submittal example for Whiskey project" |
| "Make sure to get secert santa gift" | "Get Secret Santa gift for Delaney" |

### Problematic Transformations
| Raw Input | Cleaned Title | Issue |
|-----------|---------------|-------|
| "Review Ben's change log for the timpkins pojrect" | "Follow up on the change log for Rahul" | **Wrong person, lost context** |
| "Send out the Jewell Change Log" | "Work with Trinity to estimate the hours..." | **Completely different task** |
| "Need to work on the Northwest Change Log" | "Ask Chase to review the changes to the Northwest Change Log" | **Changed action type** |

### Root Cause
The AI sometimes "improves" tasks beyond normalization, changing their intent. This happens when:
- Task seems incomplete and AI fills gaps
- AI infers workflow steps that weren't requested
- Multiple people mentioned and AI picks wrong one

---

## 8. Date Handling Analysis

### Due Date Patterns

| Pattern | Count | Example |
|---------|-------|---------|
| Specific date given | 42 | "due 1/5/26" |
| Relative date | 18 | "by Friday", "before 12/20" |
| No due date | 44 | 42% have null due_at |

### Timezone Inconsistencies

Most tasks use `17:00:00-06:00` (America/Chicago) but some have:
- `+00:00` (UTC) - 3 tasks
- Missing timezone - 2 tasks

---

## 9. Tag Analysis

### Most Common Tags

| Tag | Count | Notes |
|-----|-------|-------|
| follow-up | 14 | Core workflow pattern |
| communication | 12 | Overlaps with follow-up |
| review | 8 | QC process |
| meeting | 7 | Scheduling tasks |
| geotech | 5 | Technical domain |
| BMI | 4 | Should be project? |

### Tag Quality Issues
- **Redundant tags**: "follow-up" + "communication" often together
- **Project names as tags**: "Whiskey project", "Northwest" (should be project field)
- **Inconsistent casing**: "BMI" vs "bmi"

---

## 10. Status Distribution

| Status | Count | Percentage |
|--------|-------|------------|
| done | 68 | 65% |
| follow-up | 15 | 14% |
| active | 16 | 15% |
| inbox | 5 | 5% |

**Note:** "follow-up" status appears to be used for waiting-on-others tasks. This is a good pattern but could be formalized.

---

## Summary of AI Improvement Opportunities

### High Priority

1. **Fix project matching** - Too many null projects
2. **Preserve task intent** - Don't change action type during cleaning
3. **Calibrate importance** - Reduce clustering around 70
4. **Add contact awareness** - Learn person-project associations

### Medium Priority

5. **Generate more subtasks** - Complex tasks need breakdown
6. **Improve tag consistency** - Dedupe and normalize
7. **Handle follow-up chains** - Detect related follow-ups
8. **Add missing projects** - Whiskey, BMI, Wayne, Blackstone

### Low Priority

9. **Timezone consistency** - Always use user's configured TZ
10. **Better effort estimation** - Learn from completed tasks

---

## Recommended Next Steps

See `IMPROVEMENT_RECOMMENDATIONS.md` for specific implementation recommendations.
