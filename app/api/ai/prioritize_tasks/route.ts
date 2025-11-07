import { NextRequest, NextResponse } from "next/server";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { getSettingsFromRequest } from "@/src/lib/settings";
import { inc } from "@/src/db/metrics";
import type { PrioritizeRequest } from "@/src/types";
import requestSchema from "@/schema/prioritize.request.schema.json";
import responseSchema from "@/schema/prioritize.response.schema.json";

const ajv = new Ajv({ allErrors: true, removeAdditional: true });
addFormats(ajv);

const validateRequest = ajv.compile(requestSchema);
const validateResponse = ajv.compile(responseSchema);

export async function POST(request: NextRequest) {
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

    const {
      date,
      timezone,
      energy,
      max_focus_minutes = 240,
      calendar_windows = [],
      tasks,
    } = body as unknown as PrioritizeRequest;

    // Get settings from request or use defaults
    const settings = getSettingsFromRequest(body);

    // Prepare system prompt from SPEC.md
    const systemPrompt = `You are a planning assistant. Given tasks + today's context (date: ${date}, energy: ${
      energy || "not specified"
    }, timezone: ${
      timezone || settings.timezone
    }), assign priority_score (0–100) and bucket ∈ {Now, Next, Later, Backlog}. Keep total planned focus time for "Now" bucket ≤ ${max_focus_minutes} minutes (about ${
      max_focus_minutes / 60
    } hours). Consider urgency (time to deadline), importance, effort/energy fit, and momentum. Provide a short rationale for each task. Return STRICT JSON array with keys: id, priority_score, bucket, rationale.`;

    // Build user prompt with task details
    const taskList = tasks
      .map(
        (t: any) =>
          `- ID: ${t.id}\n  Title: ${t.title}\n  Status: ${t.status}\n  Importance: ${
            t.importance ?? "unspecified"
          }\n  Effort: ${t.effort_min ?? "unspecified"} min\n  Energy: ${
            t.energy ?? "unspecified"
          }\n  Due: ${t.due_at ?? "no deadline"}\n  Project: ${t.project ?? "none"}\n  Tags: ${
            t.tags?.join(", ") ?? "none"
          }`
      )
      .join("\n\n");

    const userPrompt = `Tasks to prioritize:\n\n${taskList}\n\n${
      calendar_windows.length > 0
        ? `Calendar windows:\n${calendar_windows
            .map((w: any) => `- ${w.type}: ${w.start} to ${w.end}`)
            .join("\n")}\n\n`
        : ""
    }Return a JSON array with prioritized tasks.`;

    // Call OpenAI API
    const openaiApiKey = process.env.OPENAI_API_KEY;
    const modelName = process.env.MODEL_NAME || "gpt-4o-mini";

    if (!openaiApiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY not configured" },
        { status: 500 }
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
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
          temperature: 0.7,
        }),
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

    // OpenAI might wrap the array in an object like { tasks: [...] } or { results: [...] }
    // Try to extract the array
    let prioritizedTasks = parsedResponse;
    if (!Array.isArray(parsedResponse)) {
      // Try common wrapper keys
      prioritizedTasks =
        parsedResponse.tasks ||
        parsedResponse.results ||
        parsedResponse.prioritized_tasks ||
        parsedResponse.data;
    }

    if (!Array.isArray(prioritizedTasks)) {
      return NextResponse.json(
        { error: "Response is not an array", details: parsedResponse },
        { status: 422 }
      );
    }

    // Validate response against schema
    if (!validateResponse(prioritizedTasks)) {
      return NextResponse.json(
        {
          error: "AI response does not match schema",
          details: validateResponse.errors,
          raw_response: prioritizedTasks,
        },
        { status: 422 }
      );
    }

    // Increment metrics on successful AI prioritization
    await inc('aiPrioritizations');

    // Return validated response
    return NextResponse.json(prioritizedTasks, { status: 200 });
  } catch (error) {
    console.error("Error in /api/ai/prioritize_tasks:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}
