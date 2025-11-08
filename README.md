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

## PWA (Progressive Web App)

Tidy is installable as a PWA on desktop and mobile devices.

### Installation
- **Chrome/Edge (Desktop & Android)**: Click the install icon in the address bar or use the in-app install prompt
- **iOS Safari**: Tap Share → "Add to Home Screen"
- **Other browsers**: Look for "Install" or "Add to Home Screen" in the browser menu

### Offline Behavior
- **UI**: The app shell and pages work offline after the first visit
- **AI endpoints**: Require network connectivity (API calls are not cached)
- **Data**: All task data is stored locally in browser storage and persists offline

### Cache Updates
- Service worker updates automatically on the next page load
- To force an update: Hard refresh (Ctrl+Shift+R / Cmd+Shift+R) or clear service worker cache in DevTools

## Next
- PR #2: add API routes `/api/ai/clean_task` and `/api/ai/prioritize_tasks` with AJV validation and redaction.
