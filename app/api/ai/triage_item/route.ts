import { NextRequest, NextResponse } from "next/server";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { inc } from "@/src/db/metrics";
import { hit, clientKey } from "@/src/lib/ratelimit";
import requestSchema from "@/schema/triage_item.request.schema.json";
import responseSchema from "@/schema/triage_item.response.schema.json";

const ajv = new Ajv({ allErrors: true, removeAdditional: true });
addFormats(ajv);
const validateRequest = ajv.compile(requestSchema);
const validateResponse = ajv.compile(responseSchema);

const MAX_TEXT_CHARS = 48_000; // ~12k tokens; longer inputs are trimmed head+tail

function getDayOfWeek(dateStr: string): string {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return days[new Date(dateStr + "T12:00:00Z").getUTCDay()];
}

function trimText(text: string): string {
  if (text.length <= MAX_TEXT_CHARS) return text;
  const head = text.slice(0, MAX_TEXT_CHARS * 0.7);
  const tail = text.slice(-MAX_TEXT_CHARS * 0.3);
  return `${head}\n\n[... ${text.length - MAX_TEXT_CHARS} characters trimmed ...]\n\n${tail}`;
}

export async function POST(request: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "Server not configured: OPENAI_API_KEY missing." }, { status: 503 });
  }

  const key = `${clientKey(request)}:/api/ai/triage_item`;
  const { allowed, resetMs } = hit(key, 30, 60_000);
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

    const {
      text,
      kind = "text",
      title = "",
      source_date = null,
      today,
      timezone,
      project = null,
      candidate_projects = [],
      agenda_sections = [],
      known_people = [],
      my_name = null,
      image_data_url = null,
    } = body as {
      text: string;
      kind?: string;
      title?: string;
      source_date?: string | null;
      today?: string;
      timezone?: string;
      project?: { name: string; aliases?: string[]; work_orders?: string[]; people?: string[]; next_milestone?: string | null } | null;
      candidate_projects?: string[];
      agenda_sections?: string[];
      known_people?: string[];
      my_name?: string | null;
      image_data_url?: string | null;
    };

    const todayDate = today || new Date().toISOString().split("T")[0];

    const projectBlock = project
      ? `PROJECT: ${project.name}
Aliases / numbers: ${(project.aliases ?? []).join(", ") || "none"}
Work orders: ${(project.work_orders ?? []).join(", ") || "none"}
People on this project: ${(project.people ?? []).join(", ") || "unknown"}
Next milestone: ${project.next_milestone ?? "unknown"}`
      : `PROJECT: not yet identified. Candidate project names: ${candidate_projects.join(", ") || "none"}. Set "project_guess" to the best candidate name if the content clearly refers to one, else null.`;

    const agendaBlock = agenda_sections.length
      ? `EXISTING MEETING AGENDA SECTIONS (choose the best fit for "agenda_section", or null if none fits):\n${agenda_sections.map((s) => `- ${s}`).join("\n")}`
      : `No agenda sections exist yet. Set "agenda_section" to a short heading this item would sit under (e.g. "LLMR Rev 2", "H-Frame Update", "Open RFIs"), or null.`;

    const systemPrompt = `You triage incoming project information for a substation design project manager at Burns & McDonnell (client: ITC). The user is ${my_name ?? "the recipient"}.
Today is ${todayDate} (${getDayOfWeek(todayDate)}). Timezone: ${timezone ?? "America/Chicago"}. Source date of this item: ${source_date ?? "unknown"}. Source kind: ${kind}.${title ? ` Title: ${title}` : ""}

${projectBlock}

${agendaBlock}

Known people (use these spellings; owners are last names or first names as they appear here): ${known_people.join(", ") || "none"}

TASK: Read the content and return strict JSON with:
- summary: 1-2 sentences, factual, no filler. What happened / what is being asked.
- include_in_meeting: true if the project team should discuss or be told this at the next weekly project meeting (decisions needed, schedule changes, scope changes, open questions to the client, deliverable status, risks). false for FYI noise, pleasantries, or items already resolved in the same content.
- include_reason: one short clause.
- agenda_section: best matching existing section, or a short new heading, or null.
- topics: 1-6 short tags (e.g. "sync breakers", "LLMR Rev 2", "fiber", "H-frame").
- decisions: decisions that were made in this content (verbatim-ish, short).
- open_questions: questions still unanswered after this content.
- dates: dated commitments or milestones mentioned (label + YYYY-MM-DD). Resolve relative dates against the source date. Skip vague dates.
- actions: concrete next steps. court = "mine" if ${my_name ?? "the user"} must do it, "theirs" if someone else owes it (client, vendor, teammate), "team" if the project team collectively owns it. owner = the person's name as written, or "ITC" / vendor name for organizations, or null. Set follow_up_by for "theirs" items (2-5 business days after source date, sooner if a deadline is mentioned). Set due_at only when a date is stated or clearly implied. Do NOT invent trivial actions like "read the email".
- project_guess: as instructed above (null when the project is already given).

Rules: never fabricate names or dates. Preserve the exact spelling of technical terms (LLMR, PR&C, Q3/Q4/Q6, IFC, RFI, MR, H-Frame, CCVT). Keep every string short.`;

    const userContent: any[] = [{ type: "text", text: trimText(text) || "(no text; see image)" }];
    if (image_data_url && /^data:image\/(png|jpe?g|webp|gif);base64,/.test(image_data_url)) {
      userContent.push({ type: "image_url", image_url: { url: image_data_url, detail: "high" } });
    }

    const modelName = process.env.MODEL_NAME || "gpt-4o-mini";
    const payload = {
      model: modelName,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
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
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "X-No-Train": "true",
      },
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

    // Light coercion before validation: the model sometimes omits nullable fields
    parsed.agenda_section ??= null;
    parsed.project_guess ??= null;
    parsed.topics ??= [];
    parsed.decisions ??= [];
    parsed.open_questions ??= [];
    parsed.dates = Array.isArray(parsed.dates) ? parsed.dates.filter((d: any) => d && /^\d{4}-\d{2}-\d{2}$/.test(d.date)) : [];
    parsed.actions = Array.isArray(parsed.actions)
      ? parsed.actions.map((a: any) => ({
          title: String(a.title ?? "").slice(0, 200),
          owner: a.owner ? String(a.owner).slice(0, 80) : null,
          court: ["mine", "theirs", "team"].includes(a.court) ? a.court : "team",
          due_at: /^\d{4}-\d{2}-\d{2}$/.test(a.due_at ?? "") ? a.due_at : null,
          follow_up_by: /^\d{4}-\d{2}-\d{2}$/.test(a.follow_up_by ?? "") ? a.follow_up_by : null,
        }))
      : [];
    parsed.include_reason = String(parsed.include_reason ?? "").slice(0, 300);
    parsed.summary = String(parsed.summary ?? "").slice(0, 600);

    if (!validateResponse(parsed)) {
      console.error("Validation errors:", validateResponse.errors);
      return NextResponse.json({ error: "AI response does not match schema", details: validateResponse.errors, raw_response: parsed }, { status: 422 });
    }

    await inc("aiCleans");
    return NextResponse.json({ ...parsed, model: modelName }, { status: 200 });
  } catch (error) {
    console.error("Error in /api/ai/triage_item:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
