import { NextRequest, NextResponse } from "next/server";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { getSettingsFromRequest } from "@/src/lib/settings";
import { endOfWeek, endOfNextWeek, containsEOW, containsEONW, isPlainDate, toEndOfDayIso } from "@/src/lib/eow";
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

    // Extract settings BEFORE validation - AJV with removeAdditional:true strips unknown fields
    // The settings field contains project list and work context needed for AI matching
    const settingsV2 = body.settings as any;
    const settingsForNormalize = getSettingsFromRequest(body);

    // Validate request against schema (this removes `settings` from body)
    if (!validateRequest(body)) {
      return NextResponse.json(
        { error: "Invalid request", details: validateRequest.errors },
        { status: 422 }
      );
    }

    const { raw_text, today, timezone, mode } = body as unknown as CleanTaskRequest & { mode?: 'default' | 'strict' };
    let contextSection = "";
    let projectList: string[] = [];

    if (settingsV2) {
      // Build context from v2 fields
      const contextParts: string[] = [];

      if (settingsV2.role?.title || settingsV2.role?.context) {
        const roleParts: string[] = [];
        if (settingsV2.role.title) roleParts.push(`Title: ${settingsV2.role.title}`);
        if (settingsV2.role.context) roleParts.push(settingsV2.role.context);
        contextParts.push(`Role: ${roleParts.join(". ")}`);
      }

      // Build rich project list with notes/aliases if available
      if (settingsV2.projects && settingsV2.projects.length > 0) {
        projectList = settingsV2.projects.map((p: any) => p.name);
        const projectDescriptions = settingsV2.projects.map((p: any) => {
          if (p.notes) {
            return `- ${p.name}: ${p.notes}`;
          }
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

    // Prepare system prompt from SPEC.md
    const todayDate = today || new Date().toISOString().split("T")[0];
    const dayOfWeek = getDayOfWeek(todayDate);

    // Build project matching instruction if projects exist
    const projectMatchingRule = projectList.length > 0
      ? `\n\nPROJECT MATCHING (CRITICAL): The "project" field MUST be EXACTLY one of: [${projectList.map(p => `"${p}"`).join(", ")}] or null.
- CASE INSENSITIVE INPUT: "tompkins" or "TOMPKINS" → "Tompkins" (use exact case from list)
- Fuzzy match: "the Tompkins project", "tompkins stuff", "for Tompkins" → "Tompkins"
- Partial match: "working on BigCorp deliverable" → "BigCorp" (if in list)
- Look for project names ANYWHERE in the text, not just as explicit mentions
- If no match found, set project to null BUT also set "suggested_project" to the detected project name (capitalized properly)
- suggested_project: If you detect a project/client name in the text that's NOT in the list, put it here (e.g., "Whiskey", "BMI"); otherwise null`
      : `\n\nPROJECT DETECTION: If you detect a project or client name in the text, set "suggested_project" to that name (properly capitalized). Set "project" to null since there's no project list yet.`;

    // Intent preservation rules to prevent the AI from changing task actions
    const intentPreservationRule = `

INTENT PRESERVATION (CRITICAL):
- The cleaned title MUST preserve the original ACTION intent from the input
- "Send X" must remain a send/email task → "Send X to Y"
- "Review X" must remain a review task → "Review X for Y"
- "Follow up with PersonA" must keep PersonA → "Follow up with PersonA about X"
- DO NOT change the primary action verb type (send→review, review→create, etc.)
- DO NOT switch the person/contact mentioned in the task
- DO NOT add workflow steps not explicitly mentioned in the input
- When uncertain, apply minimal cleanup and preserve original wording`;

    // Importance scoring guidance to reduce clustering around 70
    const importanceScoringRule = `

IMPORTANCE SCORING (use the FULL 0-100 range, avoid clustering around 70):
- 90-100: Deadline this week, client-facing deliverable, blocks others, contractual
- 70-89: Deadline next week, internal milestone, important but not urgent
- 50-69: No hard deadline, nice-to-have this week, moderate stakes
- 30-49: Backlog item, someday/maybe, no time pressure
- 0-29: Optional, exploratory, personal development, long-term
If uncertain, score LOWER (40-60) rather than defaulting to 70.`;

    // Subtask generation guidance
    const subtaskRule = `

SUBTASK GENERATION:
- Generate subtasks when: task has multiple steps, mentions "then"/"after", involves approvals, or effort >= 30 min
- Skip subtasks when: simple follow-up, single email, < 15 min effort
- Keep subtasks: actionable (verb-first), atomic (one thing each), 2-5 items max
- DO NOT generate trivial breakdowns (e.g., "Open email", "Click send")`;

    let systemPrompt = `Normalize task text. Use verb-first titles. Today is ${todayDate} (${dayOfWeek}).

DATE RULES: "next [day]" = that day NEXT week. "this [day]" or just "[day]" = upcoming occurrence. Explicit dates like "1/7/26" should be used exactly as given.${projectMatchingRule}${intentPreservationRule}${importanceScoringRule}${subtaskRule}

Return ONLY this JSON structure: {title, due_at (YYYY-MM-DD or null), scheduled_for (null unless specific time given), effort_min (5|15|30|60|90|120), energy (low|med|high), tags[] (lowercase, no project names), project (MUST match from list above or null), subtasks[], importance (0-100), notes_append (string or null), suggested_project (detected project name not in list, or null)}.${contextSection}`;

    // If strict mode, prepend stricter instructions
    if (mode === 'strict') {
      systemPrompt = `STRICT MODE: Return the absolute minimal valid JSON for CleanTaskResponse. Enforce:
- subtasks: string[] only (max 3); if unsure, []
- tags: string[] only (max 5, lowercase); if unsure, []
- energy ∈ {low,med,high}; effort_min ∈ {5,15,30,60,90,120}
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
        { role: "user", content: raw_text },
      ],
      response_format: { type: "json_object" as const },
      temperature: 0.7,
    };

    // 🔍 Debug mode - return payload instead of calling OpenAI (development only)
    if (process.env.NODE_ENV === "development") {
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

    // Parse JSON response
    let parsedResponse;
    try {
      parsedResponse = JSON.parse(content);
    } catch (e) {
      console.error("Failed to parse OpenAI JSON response:", content);
      return NextResponse.json(
        { error: "AI returned an invalid response. Please try again." },
        { status: 502 }
      );
    }

    // Use settings extracted before AJV validation (body.settings was stripped)
    const settings = settingsForNormalize;

    // Normalize response (convert plain dates to ISO datetimes, handle null notes, EOW)
    const normalizedResponse = { ...parsedResponse };

    // Handle due_at normalization
    // First, check for EOW phrases - these should OVERRIDE whatever the AI returned
    // because the user's EOW anchor setting is authoritative
    if (containsEONW(raw_text)) {
      // "end of next week" - use next week's anchor day
      normalizedResponse.due_at = endOfNextWeek(new Date(), settings);
    } else if (containsEOW(raw_text)) {
      // "end of week" or "end of the week" - use this week's anchor day
      normalizedResponse.due_at = endOfWeek(new Date(), settings);
    } else if (typeof normalizedResponse.due_at === "string" && isPlainDate(normalizedResponse.due_at)) {
      // Convert plain date to end-of-day ISO
      normalizedResponse.due_at = toEndOfDayIso(
        normalizedResponse.due_at,
        settings.timezone,
        settings.endOfDay
      );
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

    // Extract suggested_project before validation (not in schema)
    let suggestedProject = normalizedResponse.suggested_project || null;
    delete normalizedResponse.suggested_project;

    // Filter out suggested_project if it already matches a project in the list (case-insensitive)
    // This handles cases where the AI suggests a project that's already available
    if (suggestedProject && projectList.length > 0) {
      const matchesExisting = projectList.some(
        p => p.toLowerCase() === suggestedProject!.toLowerCase()
      );
      if (matchesExisting) {
        // Find the correct case from the list and set it as the project
        const correctName = projectList.find(
          p => p.toLowerCase() === suggestedProject!.toLowerCase()
        );
        if (correctName && !normalizedResponse.project) {
          normalizedResponse.project = correctName;
        }
        suggestedProject = null; // Don't suggest it since it already exists
      }
    }

    // Also clear suggested_project if a project was already matched
    if (normalizedResponse.project) {
      suggestedProject = null;
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

    // Return validated response with suggested_project as separate field
    const responsePayload = {
      ...normalizedResponse,
      // Include suggested_project if AI detected an unmatched project name
      ...(suggestedProject ? { suggested_project: suggestedProject } : {}),
    };

    return NextResponse.json(responsePayload, { status: 200 });
  } catch (error) {
    console.error("Error in /api/ai/clean_task:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
