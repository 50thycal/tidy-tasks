import { NextRequest, NextResponse } from "next/server";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { getSettingsFromRequest } from "@/src/lib/settings";
import { isPlainDate, toEndOfDayIso } from "@/src/lib/eow";
import { inc } from "@/src/db/metrics";
import { hit, clientKey } from "@/src/lib/ratelimit";
import requestSchema from "@/schema/parse_email.request.schema.json";
import responseSchema from "@/schema/parse_email.response.schema.json";

const ajv = new Ajv({ allErrors: true, removeAdditional: true });
addFormats(ajv);

const validateRequest = ajv.compile(requestSchema);
const validateResponse = ajv.compile(responseSchema);

function getDayOfWeek(dateStr: string): string {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const date = new Date(dateStr + "T12:00:00Z");
  return days[date.getUTCDay()];
}

export async function POST(request: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "Server not configured: OPENAI_API_KEY missing." },
      { status: 503 }
    );
  }

  // Rate limiting — slightly more generous since emails are larger
  const key = `${clientKey(request)}:/api/ai/parse_email`;
  const { allowed, resetMs } = hit(key, 5, 60_000);
  if (!allowed) {
    return new Response(
      JSON.stringify({ error: "Rate limit: try again shortly." }),
      {
        status: 429,
        headers: {
          "content-type": "application/json",
          "retry-after": String(Math.ceil(resetMs / 1000)),
        },
      }
    );
  }

  try {
    const body = await request.json();

    // Extract settings before AJV strips them
    const settingsV2 = body.settings as any;
    const settingsForNormalize = getSettingsFromRequest(body);

    if (!validateRequest(body)) {
      return NextResponse.json(
        { error: "Invalid request", details: validateRequest.errors },
        { status: 422 }
      );
    }

    const { email_text, today, timezone } = body as {
      email_text: string;
      today?: string;
      timezone?: string;
    };

    const todayDate = today || new Date().toISOString().split("T")[0];
    const dayOfWeek = getDayOfWeek(todayDate);

    // Build project list from settings
    let projectList: string[] = [];
    let contextSection = "";

    if (settingsV2) {
      const contextParts: string[] = [];

      if (settingsV2.role?.title || settingsV2.role?.context) {
        const roleParts: string[] = [];
        if (settingsV2.role.title) roleParts.push(`Title: ${settingsV2.role.title}`);
        if (settingsV2.role.context) roleParts.push(settingsV2.role.context);
        contextParts.push(`Role: ${roleParts.join(". ")}`);
      }

      if (settingsV2.projects && settingsV2.projects.length > 0) {
        projectList = settingsV2.projects.map((p: any) => p.name);
        const projectDescriptions = settingsV2.projects.map((p: any) => {
          if (p.notes) return `- ${p.name}: ${p.notes}`;
          return `- ${p.name}`;
        });
        contextParts.push(`Active projects:\n${projectDescriptions.join("\n")}`);
      }

      if (settingsV2.work_context) {
        contextParts.push(`Work context: ${settingsV2.work_context}`);
      }

      if (contextParts.length > 0) {
        contextSection = `\n\nUser's work context:\n${contextParts.join("\n")}`;
      }
    }

    const projectMatchingRule =
      projectList.length > 0
        ? `\nPROJECT MATCHING: Match "project" to EXACTLY one of: [${projectList.map((p) => `"${p}"`).join(", ")}] or null. Use fuzzy/partial matching. Case insensitive.`
        : `\nPROJECT DETECTION: If you detect a project or client name, set "project" to that name (properly capitalized). Otherwise null.`;

    const systemPrompt = `You are an email action-item extractor. Analyze the email below and extract all action items.

Today is ${todayDate} (${dayOfWeek}). User timezone: ${timezone || "UTC"}.

RULES:
- Categorize each action as "mine" (something the email recipient needs to do) or "theirs" (ball is in the sender's or another person's court — recipient is waiting).
- "mine" items: things the user is asked to do, respond to, review, approve, send, schedule, etc.
- "theirs" items: things someone else promised to do, deliverables the user is waiting on, information others need to provide. These become follow-up reminders.
- Use verb-first titles (e.g., "Review proposal from Sarah", "Send updated budget to Mike").
- Set "contact" to the person involved (sender for "mine" items, the person who owes something for "theirs" items).
- For "theirs" items, set "follow_up_by" to a reasonable follow-up date (typically 2-3 business days after the email, or based on any mentioned deadlines).
- For "mine" items, set "due_at" based on any mentioned deadlines, or null if none.
- If the email contains no actionable items, return an empty action_items array.
- Do NOT create trivial items like "read this email" or "open attachment".
- Keep notes brief — just enough context from the email to understand the action.
${projectMatchingRule}

IMPORTANCE SCORING:
- 90-100: Urgent deadline, client-facing, blocks others
- 70-89: Important but not urgent, internal milestone
- 50-69: No hard deadline, moderate stakes
- 30-49: Low priority, informational
- 0-29: Optional, FYI only
${contextSection}

Return ONLY this JSON: { "sender": string, "subject": string, "email_date": ISO-date-string or null, "action_items": [{ "title": string, "owner": "mine"|"theirs", "contact": string, "due_at": YYYY-MM-DD or null, "follow_up_by": YYYY-MM-DD or null, "effort_min": 5|15|30|60|90|120, "energy": "low"|"med"|"high", "importance": 0-100, "tags": string[], "project": string or null, "notes": string or null }] }`;

    const openaiApiKey = process.env.OPENAI_API_KEY;
    const modelName = process.env.MODEL_NAME || "gpt-4o-mini";

    const openAiPayload = {
      model: modelName,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: email_text },
      ],
      response_format: { type: "json_object" as const },
      temperature: 0.5,
    };

    // Debug mode (development only)
    if (process.env.NODE_ENV === "development") {
      const url = new URL(request.url);
      const debugParam = url.searchParams.get("debug");
      const debugHeader = request.headers.get("x-debug-ai");

      if (debugParam === "1" || debugHeader === "1") {
        return NextResponse.json(
          {
            debug: true,
            payload: openAiPayload,
            note: "Debug mode: OpenAI was not called.",
          },
          { status: 200 }
        );
      }
    }

    const openaiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiApiKey}`,
          "X-No-Train": "true",
        },
        body: JSON.stringify(openAiPayload),
      }
    );

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error("OpenAI API error:", errorText);
      return NextResponse.json(
        { error: "AI service unavailable. Please try again." },
        { status: 502 }
      );
    }

    const openaiData = await openaiResponse.json();
    const content = openaiData.choices?.[0]?.message?.content;

    if (!content) {
      return NextResponse.json(
        { error: "No content in OpenAI response" },
        { status: 500 }
      );
    }

    let parsedResponse;
    try {
      parsedResponse = JSON.parse(content);
    } catch {
      console.error("Failed to parse OpenAI JSON response:", content);
      return NextResponse.json(
        { error: "AI returned an invalid response. Please try again." },
        { status: 502 }
      );
    }

    const settings = settingsForNormalize;

    // Normalize dates in action items
    if (Array.isArray(parsedResponse.action_items)) {
      parsedResponse.action_items = parsedResponse.action_items.map(
        (item: any) => {
          const normalized = { ...item };

          if (
            typeof normalized.due_at === "string" &&
            isPlainDate(normalized.due_at)
          ) {
            normalized.due_at = toEndOfDayIso(
              normalized.due_at,
              settings.timezone,
              settings.endOfDay
            );
          }

          if (
            typeof normalized.follow_up_by === "string" &&
            isPlainDate(normalized.follow_up_by)
          ) {
            normalized.follow_up_by = toEndOfDayIso(
              normalized.follow_up_by,
              settings.timezone,
              settings.endOfDay
            );
          }

          // Ensure notes is null if undefined
          if (normalized.notes === undefined) {
            normalized.notes = null;
          }

          return normalized;
        }
      );
    }

    // Validate response
    if (!validateResponse(parsedResponse)) {
      console.error("Validation errors:", validateResponse.errors);
      console.error("Raw response:", parsedResponse);
      return NextResponse.json(
        {
          error: "AI response does not match schema",
          details: validateResponse.errors,
          raw_response: parsedResponse,
        },
        { status: 422 }
      );
    }

    await inc("aiCleans");

    return NextResponse.json(parsedResponse, { status: 200 });
  } catch (error) {
    console.error("Error in /api/ai/parse_email:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
