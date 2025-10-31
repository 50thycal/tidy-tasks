## 📘 `/schema` and `/types` Reference — tidy-001

This folder is the **contract layer** for Tidy: JSON Schemas for tasks and AI endpoints,
plus TypeScript types under `/types`. Everything else should conform to these files.

---

### 🗂 File Map

- **schema/task.json** — Core Task entity stored locally.
- **schema/clean_task.request.schema.json** — Input to `/api/ai/clean_task`.
- **schema/clean_task.response.schema.json** — Output from `/api/ai/clean_task`.
- **schema/prioritize.request.schema.json** — Input to `/api/ai/prioritize_tasks`.
- **schema/prioritize.response.schema.json** — Output from `/api/ai/prioritize_tasks`.
- **types/api.d.ts** — TS interfaces + tiny client factory.

> Note: `prioritize.response` uses **TitleCase** bucket labels (`Now|Next|Later|Backlog`) because
> we expect LLMs to return human labels; the app normalizes to lowercase enums internally.

---

### ✅ Validation (AJV CLI)

Install once:
```bash
npm i -D ajv ajv-cli
```

Validate examples:
```bash
npm run schema:check
# equivalent to:
ajv validate -s schema/clean_task.response.schema.json -d api/clean_task_example.json
ajv validate -s schema/prioritize.response.schema.json -d api/prioritize_tasks_example.json
```

Validate a request payload:
```bash
ajv validate -s schema/clean_task.request.schema.json -d api/clean_task_example.json
```

Programmatic example:
```typescript
import Ajv from "ajv";
import respSchema from "../schema/prioritize.response.schema.json";

const ajv = new Ajv({ allErrors: true, removeAdditional: true });
const validate = ajv.compile(respSchema);
const ok = validate(json);
if (!ok) console.error(validate.errors);
```

---

### 🧩 Types from Schemas (optional)

Generate TypeScript types (useful for API clients or reducers):
```bash
npm run types:gen
# produces: types/generated.d.ts
```

We also include hand-written types in `/types/api.d.ts` for stable imports and a
minimal `createTidyApiClient()` helper.

---

### 🔒 Privacy & Redaction

All AI calls must:
- Include a provider no-train flag/header.
- Run input through `src/lib/redact.ts` (emails, phones, proper names) before model calls.
- Validate model JSON after the call using these schemas.

---

### 🎯 Design Notes

- **Strictness:** `additionalProperties: false` wherever possible. If new fields are needed,
  add to schema first, then code.
- **Time:** ISO 8601 for date-time; requests may also pass YYYY-MM-DD where documented.
- **Effort:** Enum of `{5,15,30,60,120}` to simplify planning math.
- **Energy:** Enum of `{low,med,high}`.
- **Buckets:** UI shows Now/Next/Later/Backlog; storage uses lowercase.

---

### 🧪 Contract Tests (suggested)

1. **Happy path:** model returns exactly the response schema — should pass AJV.
2. **Missing required key** (e.g., title): AJV fails with 422 on API.
3. **Extra key** (e.g., weird_field): stripped or rejected per `removeAdditional`.
4. **Bucket casing:** accept Now|Next|Later|Backlog; normalize to lowercase in app.

---

### 🔁 Versioning

- Bump a `$id` URL or add a version field when making breaking changes.
- Keep old schemas around during migrations to avoid CI breakage.

---

### ❓FAQ

- **Why TitleCase in prioritize response?** LLMs often produce display labels; we validate against TitleCase then normalize.
- **Why AJV and not Zod only?** AJV is fast for runtime validation + schema-as-source-of-truth; you can still use Zod in components.
- **Where to change scoring?** See SPEC.md for the v1 formula and any future updates.

---

Source of truth: SPEC.md + these schemas. If code and schema disagree, fix code or open a schema update PR first.
