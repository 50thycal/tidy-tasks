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

    const me = my_name ?? "the recipient";
    const systemPrompt = `You triage incoming project information for a substation design project manager at Burns & McDonnell (client: ITC). The user is ${me}. Content written by or addressed to the user may use their first name, last name, full name, or signature block; treat all of those as the user.
Today is ${todayDate} (${getDayOfWeek(todayDate)}). Timezone: ${timezone ?? "America/Chicago"}. Source date of this item: ${source_date ?? "unknown"}. Source kind: ${kind}.${title ? ` Title: ${title}` : ""}

${projectBlock}

${agendaBlock}

Known people (use these spellings; owners are last names or first names as they appear here): ${known_people.join(", ") || "none"}

Return STRICT JSON in exactly this shape:
{
  "summary": "1-2 sentences, factual, no filler: what happened or what is being asked",
  "include_in_meeting": true,
  "include_reason": "one short clause",
  "agenda_section": "best matching existing section, a short new heading, or null",
  "topics": ["1-6 short tags, e.g. sync breakers, LLMR Rev 2, fiber, H-frame"],
  "decisions": ["decisions actually made in this content, short"],
  "open_questions": ["questions still unanswered after this content"],
  "dates": [{ "label": "what the date is for", "date": "YYYY-MM-DD" }],
  "actions": [{ "title": "verb-first next step", "owner": "person or org, or null", "court": "mine", "due_at": null, "follow_up_by": null }],
  "project_guess": "best candidate project name, or null"
}

ACTIONS ARE THE MOST IMPORTANT FIELD, and most real messages contain two or more. Extract one for every commitment, request, or unanswered ask, including ones already in flight. In this line of work an action is almost always one of:
- a request to the client or a vendor that has not been answered yet
- something someone promised to send, update, confirm, or advise on
- a QC or review assignment to a named person (Q3, Q4, Q6, "to be QC'ed by X")
- an RFI opened and awaiting a response
- a document, markup, cut sheet, point list, drawing, or quantity someone owes
- a meeting, site visit, or call that must be scheduled or confirmed
- a count, drawing, or requisition that must be revised because of new information

court: "mine" when ${me} must do it, "theirs" when someone else owes it (client, vendor, teammate), "team" when the project team collectively owns it.
owner: the person's name as written, or an organization ("ITC", "DTE", "Valmont"), or null when genuinely unassigned.
follow_up_by: set on every "theirs" action (2-5 business days after the source date, sooner if a deadline is stated).
due_at: only when a date is stated or clearly implied.

Worked examples of the expected extraction:
- "I sent out the Siemens breaker options to Lake. Still no answer on how to move forward." -> { "title": "Confirm how to move forward on Siemens breaker options", "owner": "Lake", "court": "theirs" }
- "Lauren informed me that the Bus Diff CCVTs need to be 3-phase. So we are going to be updating the CCVT count on the LLMR." -> { "title": "Update the CCVT count on the LLMR for 3-phase Bus Diff CCVTs", "owner": null, "court": "team" }
- "Sync Breakers (john - to be QC'ed by Jacob)" -> { "title": "QC the sync breaker drawings", "owner": "Jacob", "court": "theirs" }
- "BMcD has asked DTE to markup the attached PDF with the anticipated fiber lines." -> { "title": "Mark up the switchyard fiber routing PDF with anticipated fiber lines", "owner": "DTE", "court": "theirs" }
- "Please advise if this phasing is acceptable." -> { "title": "Advise whether the station phasing is acceptable", "owner": "DTE", "court": "theirs" }
- "need to let stephen know" -> { "title": "Tell Stephen about the site visit", "owner": "Stephen", "court": "mine" }
- "Could you send me a calendar invite with the time?" -> { "title": "Send the site visit calendar invite", "owner": "Ahmed", "court": "theirs" }

Do NOT create an action for pleasantries, acknowledgements ("thanks", "congratulations"), or for reading the message itself. An item whose only content is a pleasantry has no actions and include_in_meeting false.

Rules: never fabricate names or dates. Preserve the exact spelling of technical terms (LLMR, PR&C, Q3/Q4/Q6, IFC, RFI, MR, H-Frame, CCVT, FOPP, RTU, DFR). Keep every string short.`;

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

    // Clamp everything to the schema instead of rejecting a slightly-too-long reply
    const str = (v: unknown, max: number, fallback = ""): string => (typeof v === "string" ? v : v == null ? fallback : String(v)).trim().slice(0, max);
    const strOrNull = (v: unknown, max: number): string | null => (v == null || v === "" ? null : str(v, max));
    const strArr = (v: unknown, maxItems: number, maxLen: number): string[] =>
      (Array.isArray(v) ? v : []).filter((x) => x != null && String(x).trim()).map((x) => str(x, maxLen)).slice(0, maxItems);
    const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
    const bool = (v: unknown): boolean => v === true || (typeof v === "string" && /^(true|yes)$/i.test(v));

    parsed = {
      summary: str(parsed.summary, 600),
      include_in_meeting: bool(parsed.include_in_meeting),
      include_reason: str(parsed.include_reason, 300),
      agenda_section: strOrNull(parsed.agenda_section, 120),
      topics: strArr(parsed.topics, 8, 60),
      decisions: strArr(parsed.decisions, 10, 300),
      open_questions: strArr(parsed.open_questions, 10, 300),
      dates: (Array.isArray(parsed.dates) ? parsed.dates : [])
        .filter((d: any) => d && isDate(d.date))
        .map((d: any) => ({ label: str(d.label, 120, "date"), date: d.date }))
        .slice(0, 12),
      actions: (Array.isArray(parsed.actions) ? parsed.actions : [])
        .filter((a: any) => a && String(a.title ?? "").trim())
        .map((a: any) => ({
          title: str(a.title, 200),
          owner: strOrNull(a.owner, 80),
          court: ["mine", "theirs", "team"].includes(a.court) ? a.court : "team",
          due_at: isDate(a.due_at) ? a.due_at : null,
          follow_up_by: isDate(a.follow_up_by) ? a.follow_up_by : null,
        }))
        .slice(0, 15),
      project_guess: strOrNull(parsed.project_guess, 80),
    };

    if (!validateResponse(parsed)) {
      console.error("Validation errors:", validateResponse.errors);
      const detail = (validateResponse.errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message ?? ""}`).join("; ");
      return NextResponse.json({ error: `AI response does not match schema: ${detail}`, details: validateResponse.errors, raw_response: parsed }, { status: 422 });
    }

    await inc("aiCleans");
    return NextResponse.json({ ...parsed, model: modelName }, { status: 200 });
  } catch (error) {
    console.error("Error in /api/ai/triage_item:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
