import { NextRequest, NextResponse } from "next/server";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { inc } from "@/src/db/metrics";
import { hit, clientKey } from "@/src/lib/ratelimit";
import requestSchema from "@/schema/prep_meeting.request.schema.json";
import responseSchema from "@/schema/prep_meeting.response.schema.json";

const ajv = new Ajv({ allErrors: true, removeAdditional: true });
addFormats(ajv);
const validateRequest = ajv.compile(requestSchema);
const validateResponse = ajv.compile(responseSchema);

export async function POST(request: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "Server not configured: OPENAI_API_KEY missing." }, { status: 503 });
  }
  const key = `${clientKey(request)}:/api/ai/prep_meeting`;
  const { allowed, resetMs } = hit(key, 6, 60_000);
  if (!allowed) {
    return new Response(JSON.stringify({ error: "Rate limit: try again shortly." }), {
      status: 429,
      headers: { "content-type": "application/json", "retry-after": String(Math.ceil(resetMs / 1000)) },
    });
  }

  try {
    const body = await request.json();
    if (!validateRequest(body)) {
      return NextResponse.json({ error: "Invalid request", details: validateRequest.errors }, { status: 422 });
    }
    const { today, timezone, my_name, project, agenda, items, open_tasks = [], stale_after_days = 14 } = body as any;
    const todayDate = today || new Date().toISOString().split("T")[0];

    const itemsBlock = (items as any[])
      .map((it) => {
        const parts = [
          `### ITEM ${it.id} | ${it.kind ?? "text"} | ${it.source_date ?? "undated"} | ${it.title}`,
          it.summary ? `Summary: ${it.summary}` : null,
          it.agenda_section ? `Suggested section: ${it.agenda_section}` : null,
          it.decisions?.length ? `Decisions: ${it.decisions.join(" | ")}` : null,
          it.open_questions?.length ? `Open questions: ${it.open_questions.join(" | ")}` : null,
          it.dates?.length ? `Dates: ${it.dates.map((d: any) => `${d.date} ${d.label}`).join(" | ")}` : null,
          it.actions?.length ? `Actions: ${it.actions.map((a: any) => `[${a.court}${a.owner ? ` ${a.owner}` : ""}] ${a.title}${a.due_at ? ` due ${a.due_at}` : ""}`).join(" | ")}` : null,
          it.excerpt ? `Excerpt: ${it.excerpt}` : null,
        ].filter(Boolean);
        return parts.join("\n");
      })
      .join("\n\n");

    const systemPrompt = `You prepare the weekly project meeting notes for ${my_name ?? "the project manager"}, a substation design project manager at Burns & McDonnell (client: ITC). Today is ${todayDate}. Timezone ${timezone ?? "America/Chicago"}.

PROJECT: ${project.name}
Work orders: ${(project.work_orders ?? []).join("; ") || "n/a"}
People: ${(project.people ?? []).join(", ") || "n/a"}
Milestones: ${(project.milestones ?? []).join("; ") || "n/a"}
Last meeting: ${project.last_meeting_at ?? "unknown"}. Cadence: ${project.cadence ?? "weekly"}. Stale threshold: ${stale_after_days} days without an update.

The team keeps ONE running outline (the "living agenda") that is published after every meeting. Headings are topics (e.g. "LLMR REV 2", "H-Frame Update", "Grounding", "Phase 1 - QC needs"). New information is appended as bullets under the right heading, usually nested under the bullet it updates, in the team's terse style ("Josh to follow up with Lake on sync breaker rating", "As of 8/31, ITC has not received any information from Valmont").

CURRENT LIVING AGENDA (each bullet has a short id in parentheses):
${agenda || "(empty)"}

OPEN TASKS in the tracker (for context, do not duplicate as inserts unless they need discussion):
${(open_tasks as string[]).map((t) => `- ${t}`).join("\n") || "(none)"}

NEW ITEMS since the last meeting (feed items, already triaged):
${itemsBlock || "(none)"}

YOUR JOB: return strict JSON:
{
  "summary": "2-3 sentences: what changed since last meeting and what needs a decision.",
  "inserts": [ { "section": "existing heading (exact text) or a new short heading", "after_bullet_id": "short id of the bullet this updates, or null to append at the end of the section", "depth": 0-3, "text": "one bullet in the team's style, dated when it reports status (e.g. 'As of 9/12, ...')", "source_item_ids": ["ITEM id(s)"], "reason": "why it belongs in the meeting" } ],
  "stale": [ { "bullet_id": "short id", "reason": "resolved by ITEM x / no update in N days / superseded" } ],
  "waiting_on": [ { "owner": "person or org", "text": "what they owe", "since": "YYYY-MM-DD or null", "source_item_ids": [] } ]
}

RULES:
- One insert per distinct piece of news. Merge items about the same topic into one bullet; cite all their ids.
- Prefer nesting under the existing bullet that the news updates (set after_bullet_id). Only create a new heading when nothing fits.
- Skip items whose triage says they are not for the meeting unless they contain a decision, a date change, or an unanswered question to the client.
- Never invent facts, names, or dates. Use names exactly as they appear. Keep each bullet under 40 words.
- "stale" is for bullets that are clearly resolved by new items or that ask a question that has since been answered. Do not mark schedule tables or reviewer assignments stale.
- "waiting_on" lists everything still owed by someone other than ${my_name ?? "the PM"} across the agenda and new items: client answers, vendor info, reviewer confirmations.`;

    const modelName = process.env.MODEL_NAME || "gpt-4o-mini";
    const payload = {
      model: modelName,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: "Prepare the proposals now." },
      ],
      response_format: { type: "json_object" as const },
      temperature: 0.2,
    };

    if (process.env.NODE_ENV === "development") {
      const url = new URL(request.url);
      if (url.searchParams.get("debug") === "1" || request.headers.get("x-debug-ai") === "1") {
        return NextResponse.json({ debug: true, payload, note: "Debug mode: OpenAI was not called." });
      }
    }

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "X-No-Train": "true" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error("OpenAI API error:", await res.text());
      return NextResponse.json({ error: "AI service unavailable. Please try again." }, { status: 502 });
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return NextResponse.json({ error: "No content in OpenAI response" }, { status: 500 });

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      return NextResponse.json({ error: "AI returned an invalid response. Please try again." }, { status: 502 });
    }

    parsed.summary = String(parsed.summary ?? "").slice(0, 800);
    parsed.inserts = Array.isArray(parsed.inserts)
      ? parsed.inserts
          .filter((i: any) => i && typeof i.text === "string" && i.text.trim())
          .map((i: any) => ({
            section: String(i.section ?? "New Items for Discussion").trim().slice(0, 120) || "New Items for Discussion",
            after_bullet_id: i.after_bullet_id ? String(i.after_bullet_id).slice(0, 40) : null,
            depth: Number.isInteger(i.depth) ? Math.min(5, Math.max(0, i.depth)) : 0,
            text: String(i.text).trim().slice(0, 500),
            source_item_ids: Array.isArray(i.source_item_ids) ? i.source_item_ids.map(String).slice(0, 10) : [],
            reason: String(i.reason ?? "").slice(0, 200),
          }))
          .slice(0, 60)
      : [];
    parsed.stale = Array.isArray(parsed.stale)
      ? parsed.stale.filter((s: any) => s && s.bullet_id).map((s: any) => ({ bullet_id: String(s.bullet_id).slice(0, 40), reason: String(s.reason ?? "").slice(0, 200) })).slice(0, 40)
      : [];
    parsed.waiting_on = Array.isArray(parsed.waiting_on)
      ? parsed.waiting_on
          .filter((w: any) => w && w.text)
          .map((w: any) => ({
            owner: String(w.owner ?? "?").slice(0, 80),
            text: String(w.text).slice(0, 300),
            since: /^\d{4}-\d{2}-\d{2}$/.test(w.since ?? "") ? w.since : null,
            source_item_ids: Array.isArray(w.source_item_ids) ? w.source_item_ids.map(String).slice(0, 10) : [],
          }))
          .slice(0, 40)
      : [];

    if (!validateResponse(parsed)) {
      console.error("Validation errors:", validateResponse.errors);
      const detail = (validateResponse.errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message ?? ""}`).join("; ");
      return NextResponse.json({ error: `AI response does not match schema: ${detail}`, details: validateResponse.errors, raw_response: parsed }, { status: 422 });
    }

    await inc("aiCleans");
    return NextResponse.json(parsed, { status: 200 });
  } catch (error) {
    console.error("Error in /api/ai/prep_meeting:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
