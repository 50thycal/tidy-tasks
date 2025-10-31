# Tidy (tidy-001)
Lightweight task tracker with AI-assisted cleanup and prioritization.
Source of truth: `SPEC.md` and JSON Schemas under `/schema`.

## Dev
- `npm run dev` — start Next
- `npm run schema:check` — validate example payloads with AJV
- `npm run types:gen` — generate TS types from schemas (optional)

## Env
- `OPENAI_API_KEY` — model key
- `MODEL_NAME` — default gpt-4o-mini
- `TZ` — default America/Phoenix

## Next
- PR #2: add API routes `/api/ai/clean_task` and `/api/ai/prioritize_tasks` with AJV validation and redaction.
