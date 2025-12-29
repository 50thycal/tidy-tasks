import { NextRequest, NextResponse } from "next/server";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { redact } from "@/src/lib/redact";
import { normalizeCleanTaskResponse } from "@/src/lib/datetime";
import { getSettingsFromRequest } from "@/src/lib/settings";
import { endOfWeek, containsEOW, isPlainDate, toEndOfDayIso } from "@/src/lib/eow";
import { normalizeSubtasks } from "@/src/lib/normalize";
import { inc } from "@/src/db/metrics";
import { hit, clientKey } from "@/src/lib/ratelimit";
import type { CleanTaskRequest } from "@/src/types";
import requestSchema from "@/schema/clean_task.request.schema.json";
import responseSchema from "@/schema/clean_task.response.schema.json";

const ajv = new Ajv({ allErrors: true, removeAdditional: true });
addFormats(ajv);

const validateRequest = ajv.compile(requestSchema);
const validateResponse = ajv.compile(responseSchema);

// Helper to get day of week name from a date string (YYYY-MM-DD)
function getDayOfWeek(dateStr: string): string {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const date = new Date(dateStr + "T12:00:00Z"); // Use noon UTC to avoid timezone issues
  return days[date.getUTCDay()];
}

export async function POST(request: NextRequest) {
  // Check for API key
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: 'Server not configured: OPENAI_API_KEY missing.' },
      { status: 503 }
    );
  }

  // Rate limiting
  const key = `${clientKey(request)}:/api/ai/clean_task`;
  const { allowed, resetMs } = hit(key, 10, 60_000);
  if (!allowed) {
    return new Response(
      JSON.stringify({ error: 'Rate limit: try again shortly.' }),
      {
        status: 429,
        headers: {
          'content-type': 'application/json',
          'retry-after': String(Math.ceil(resetMs / 1000))
        }
      }
    );
  }

  try {
    // Parse request body
    const body = await request.json();

    // Validate request against schema
    if (!validateRequest(body)) {
      return NextResponse.json(
        { error: "Invalid request", details: validateRequest.errors },
        { status: 422 }
      );
    }

    const { raw_text, today, timezone, redaction, mode } = body as unknown as CleanTaskRequest & { mode?: 'default' | 'strict' };

    // Apply redaction if enabled
    const shouldRedact = redaction?.enabled !== false;
    const textToSend = shouldRedact ? redact({ text: raw_text }).text : raw_text;

    // Extract work context from settings (v2 fields)
    const settingsV2 = body.settings as any;
    let contextSection = "";

    if (settingsV2) {
      // Build context from v2 fields
      const contextParts: string[] = [];

      if (settingsV2.role?.title || settingsV2.role?.context) {
        const roleParts: string[] = [];
        if (settingsV2.role.title) roleParts.push(`Title: ${settingsV2.role.title}`);
        if (settingsV2.role.context) roleParts.push(settingsV2.role.context);
        contextParts.push(`Role: ${roleParts.join(". ")}`);
      }

      if (settingsV2.projects && settingsV2.projects.length > 0) {
        const projectNames = settingsV2.projects.map((p: any) => p.name).join(", ");
        contextParts.push(`Active projects: ${projectNames}`);
      }

      if (settingsV2.work_context) {
        contextParts.push(`Work context: ${settingsV2.work_context}`);
      }

      if (contextParts.length > 0) {
        contextSection = `\n\nUser's work context:\n${contextParts.join("\n")}`;
      }
    }

    // Prepare system prompt from SPEC.md
    const todayDate = today || new Date().toISOString().split("T")[0];
    const dayOfWeek = getDayOfWeek(todayDate);

    let systemPrompt = `Normalize task text. Use verb-first titles.

DATE PARSING RULES (today is ${todayDate}, a ${dayOfWeek}):
- "next [day]" means the [day] of NEXT week, not this week (e.g., if today is Sunday Dec 29, "next Friday" = Friday Jan 9, not Jan 3)
- "this [day]" or just "[day]" means the upcoming occurrence this week (e.g., "Friday" or "this Friday" = the nearest future Friday)
- "tomorrow" = the day after today
- Always verify the day of week matches the date you return (e.g., if user says "Friday", the due_at date MUST fall on a Friday)

Estimate effort ∈ {5,15,30,60,120} and energy ∈ {low,med,high}. Infer importance (0–100), tags, and project if obvious. If compound, split into subtasks. Return STRICT JSON with keys: title, due_at (ISO 8601 or null), scheduled_for (ISO 8601 or null), effort_min, energy, tags[], project (or null), subtasks[], importance (0–100), notes_append (optional).${contextSection}`;

    // If strict mode, prepend stricter instructions
    if (mode === 'strict') {
      systemPrompt = `STRICT MODE: Return the absolute minimal valid JSON for CleanTaskResponse. Enforce:
- subtasks: string[] only (max 3); if unsure, []
- tags: string[] only (max 5, lowercase); if unsure, []
- energy ∈ {low,med,high}; effort_min ∈ {5,15,30,60,120}
- importance: integer 0–100
- due_at/scheduled_for: ISO 8601 or null; never plain words
If any field is uncertain, omit or use null/[] rather than inventing values.

${systemPrompt}`;
    }

    // Call OpenAI API
    const openaiApiKey = process.env.OPENAI_API_KEY;
    const modelName = process.env.MODEL_NAME || "gpt-4o-mini";

    if (!openaiApiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY not configured" },
        { status: 500 }
      );
    }

    // Build OpenAI payload
    const openAiPayload = {
      model: modelName,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: textToSend },
      ],
      response_format: { type: "json_object" as const },
      temperature: 0.7,
    };

    // 🔍 Debug mode - return payload instead of calling OpenAI
    const url = new URL(request.url);
    const debugParam = url.searchParams.get("debug");
    const debugHeader = request.headers.get("x-debug-ai");

    if (debugParam === "1" || debugHeader === "1") {
      return NextResponse.json(
        {
          debug: true,
          payload: openAiPayload,
          note: "Debug mode: OpenAI was not called. This is the exact payload that would be sent."
        },
        { status: 200 }
      );
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
        { error: "Failed to call OpenAI API", details: errorText },
        { status: 500 }
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

    // Parse JSON response
    let parsedResponse;
    try {
      parsedResponse = JSON.parse(content);
    } catch (e) {
      return NextResponse.json(
        { error: "Failed to parse OpenAI JSON response", details: content },
        { status: 500 }
      );
    }

    // Get settings from request or use defaults
    const settings = getSettingsFromRequest(body);

    // Normalize response (convert plain dates to ISO datetimes, handle null notes, EOW)
    const normalizedResponse = { ...parsedResponse };

    // Handle due_at normalization
    if (typeof normalizedResponse.due_at === "string" && isPlainDate(normalizedResponse.due_at)) {
      // Convert plain date to end-of-day ISO
      normalizedResponse.due_at = toEndOfDayIso(
        normalizedResponse.due_at,
        settings.timezone,
        settings.endOfDay
      );
    } else if (!normalizedResponse.due_at && containsEOW(raw_text)) {
      // If no due_at but text contains "end of week", compute it
      normalizedResponse.due_at = endOfWeek(new Date(), settings);
    }

    // Handle scheduled_for normalization
    if (typeof normalizedResponse.scheduled_for === "string" && isPlainDate(normalizedResponse.scheduled_for)) {
      normalizedResponse.scheduled_for = toEndOfDayIso(
        normalizedResponse.scheduled_for,
        settings.timezone,
        settings.endOfDay
      );
    }

    // Ensure notes_append is null if undefined
    if (normalizedResponse.notes_append === undefined) {
      normalizedResponse.notes_append = null;
    }

    // Normalize subtasks: coerce objects/arrays to strings before validation
    if ("subtasks" in normalizedResponse) {
      normalizedResponse.subtasks = normalizeSubtasks(normalizedResponse.subtasks);
    }

    // Validate response against schema
    if (!validateResponse(normalizedResponse)) {
      return NextResponse.json(
        {
          error: "AI response does not match schema",
          details: validateResponse.errors,
          raw_response: normalizedResponse,
        },
        { status: 422 }
      );
    }

    // Increment metrics on successful AI clean
    await inc('aiCleans');

    // Return validated response
    return NextResponse.json(normalizedResponse, { status: 200 });
  } catch (error) {
    console.error("Error in /api/ai/clean_task:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}
