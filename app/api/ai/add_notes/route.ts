import { NextRequest, NextResponse } from "next/server";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { inc } from "@/src/db/metrics";
import { hit, clientKey } from "@/src/lib/ratelimit";
import type { AddNotesRequest, AddNotesResponse } from "@/types/api";
import requestSchema from "@/schema/add_notes.request.schema.json";
import responseSchema from "@/schema/add_notes.response.schema.json";

const ajv = new Ajv({ allErrors: true, removeAdditional: true });
addFormats(ajv);

const validateRequest = ajv.compile(requestSchema);
const validateResponse = ajv.compile(responseSchema);

export async function POST(request: NextRequest) {
  // Check for API key
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: 'Server not configured: OPENAI_API_KEY missing.' },
      { status: 503 }
    );
  }

  // Rate limiting
  const key = `${clientKey(request)}:/api/ai/add_notes`;
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
      console.error("Add notes validation failed:", JSON.stringify(validateRequest.errors, null, 2));
      console.error("Request body:", JSON.stringify(body, null, 2));
      return NextResponse.json(
        { error: "Invalid request", details: validateRequest.errors },
        { status: 422 }
      );
    }

    const { task, new_note_raw } = body as unknown as AddNotesRequest;

    // Build task context for AI
    const taskContext = [
      `Title: ${task.title}`,
      task.project ? `Project: ${task.project}` : null,
      task.tags && task.tags.length > 0 ? `Tags: ${task.tags.join(", ")}` : null,
      task.notes ? `Existing notes: ${task.notes}` : null,
      task.importance !== undefined ? `Importance: ${task.importance}` : null,
      task.energy ? `Energy: ${task.energy}` : null,
      task.planned_day ? `Planned day: ${task.planned_day}` : null,
      task.due_at ? `Due: ${task.due_at}` : null,
    ].filter(Boolean).join("\n");

    // Prepare system prompt
    const systemPrompt = `You are helping update notes and tags for a task in a task manager.

You receive:
- The current task context (title, project, existing tags, existing notes, importance, energy, planned_day, due_at)
- A new raw note from the user

Your job:
1. Clean up the new note into a concise, clear, single block of text
2. Suggest additional tags that should be added to this task based on the new note and task context

Rules:
- Return JSON only with:
  - notes_append: string (the cleaned note)
  - tags_to_add: array of short, lowercase tags with no duplicates
- Do not repeat existing tags in tags_to_add
- Do not modify the task title or project; you are only appending notes and proposing new tags
- Keep notes concise and actionable
- Tags should be short (1-3 words), lowercase, hyphenated if multiple words (e.g., "utility-conflict")

Return STRICT JSON with keys: notes_append, tags_to_add.`;

    const userPrompt = `Task context:
${taskContext}

New note from user:
${new_note_raw}

Return JSON with cleaned note and suggested tags.`;

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
        { role: "user", content: userPrompt },
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
    let parsedResponse: AddNotesResponse;
    try {
      parsedResponse = JSON.parse(content);
    } catch (e) {
      console.error("Failed to parse OpenAI JSON response:", content);
      return NextResponse.json(
        { error: "AI returned an invalid response. Please try again." },
        { status: 502 }
      );
    }

    // Validate response against schema
    if (!validateResponse(parsedResponse)) {
      return NextResponse.json(
        {
          error: "AI response does not match schema",
          details: validateResponse.errors,
          raw_response: parsedResponse,
        },
        { status: 422 }
      );
    }

    // Filter out existing tags from tags_to_add
    const existingTags = new Set(task.tags?.map(t => t.toLowerCase()) || []);
    const filteredTags = parsedResponse.tags_to_add.filter(
      tag => !existingTags.has(tag.toLowerCase())
    );

    const finalResponse: AddNotesResponse = {
      notes_append: parsedResponse.notes_append,
      tags_to_add: filteredTags,
    };

    // Increment metrics on successful AI note processing
    await inc('aiAddNotes');

    // Return validated response
    return NextResponse.json(finalResponse, { status: 200 });
  } catch (error) {
    console.error("Error in /api/ai/add_notes:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
