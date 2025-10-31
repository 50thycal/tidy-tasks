# AI CONTRACT — tidy-001

## Purpose
Implement two endpoints that transform messy tasks into structured objects and generate a prioritized plan.

## Privacy
- All outbound model calls must set **X-No-Train: true** (or provider-equivalent).
- Run `redact.ts` before any AI call to mask emails/phones/proper names.

## Schemas (source of truth)
- schema/task.json
- schema/clean_task.request.schema.json
- schema/clean_task.response.schema.json
- schema/prioritize.request.schema.json
- schema/prioritize.response.schema.json

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

## Model Prompts (from SPEC.md)
- "Clean Task — system" and "Prioritize — system" exactly as in SPEC.md.

## Non-negotiables
- STRICT JSON only from model (use JSON mode / function calling if available).
- Validate every model response with AJV before returning.
- Do not invent keys beyond schema.
- Timezone: default America/Phoenix unless supplied in request.

## Fallbacks
- If model unavailable, use local `lib/prioritize.ts` with the v1 formula from SPEC.md.
