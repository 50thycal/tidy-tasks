# AI CONTRACT — tidy-001

## Purpose
Implement AI endpoints that transform messy tasks into structured objects, generate a prioritized plan, and clean up task notes with intelligent tag suggestions.

## Privacy
- All outbound model calls must set **X-No-Train: true** (or provider-equivalent).
- Run `redact.ts` before any AI call to mask emails/phones/proper names (where applicable).

## Schemas (source of truth)
- schema/task.json
- schema/clean_task.request.schema.json
- schema/clean_task.response.schema.json
- schema/prioritize.request.schema.json
- schema/prioritize.response.schema.json
- schema/add_notes.request.schema.json
- schema/add_notes.response.schema.json

## Endpoints
1) POST /api/ai/clean_task
   - Input: CleanTaskRequest
   - Output: CleanTaskResponse
   - Steps:
     1. redact input
     2. call LLM with "Clean Task — system prompt" from SPEC.md
     3. validate response against `clean_task.response.schema.json` (ajv)
     4. return JSON or 422 with validation errors

2) POST /api/ai/prioritize_tasks
   - Input: PrioritizeRequest
   - Output: PrioritizeResponse (array) + optional focus_queue_summary
   - Steps:
     1. call LLM with "Prioritize — system prompt" from SPEC.md
     2. validate against `prioritize.response.schema.json`
     3. return JSON or 422
   - Task fields available to AI:
     - **planned_day** (optional): one of "mon", "tue", "wed", "thu", "fri", "weekend", or null.
       Represents when the user intends to work on the task. This is a soft signal — when possible,
       align "Now"/"Next" suggestions with tasks whose planned_day matches the current day and whose
       due dates/importance justify focus. The AI should use this as a hint but not as a hard constraint.

3) POST /api/ai/add_notes
   - Input: AddNotesRequest
   - Output: AddNotesResponse
   - Purpose: Clean up messy notes and suggest additional tags for a task
   - Steps:
     1. Receive task context (title, project, existing tags, existing notes, importance, energy, planned_day, due_at)
     2. Receive new raw note from user
     3. Call LLM with system prompt to:
        - Clean up the note into concise, clear text
        - Suggest additional tags based on the note content and task context
        - Avoid suggesting tags that already exist on the task
     4. Validate response against `add_notes.response.schema.json`
     5. Return `notes_append` (cleaned note) and `tags_to_add` (suggested new tags)
   - Frontend behavior:
     - Append `notes_append` to task's existing notes
     - Merge `tags_to_add` into task's tags (no duplicates)
   - No redaction required (user is adding notes to their own task)

## Model Prompts (from SPEC.md)
- "Clean Task — system" and "Prioritize — system" exactly as in SPEC.md.

## Non-negotiables
- STRICT JSON only from model (use JSON mode / function calling if available).
- Validate every model response with AJV before returning.
- Do not invent keys beyond schema.
- Timezone: default America/Phoenix unless supplied in request.

## Fallbacks
- If model unavailable, use local `lib/prioritize.ts` with the v1 formula from SPEC.md.
