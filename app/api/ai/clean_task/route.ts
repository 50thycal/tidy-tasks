import { NextRequest, NextResponse } from "next/server";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { redact } from "@/src/lib/redact";
import type { CleanTaskRequest } from "@/src/types";
import requestSchema from "@/schema/clean_task.request.schema.json";
import responseSchema from "@/schema/clean_task.response.schema.json";

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

    const { raw_text, today, timezone, redaction } = body as unknown as CleanTaskRequest;

    // Apply redaction if enabled
    const shouldRedact = redaction?.enabled !== false;
    const textToSend = shouldRedact ? redact({ text: raw_text }).text : raw_text;

    // Prepare system prompt from SPEC.md
    const systemPrompt = `Normalize task text. Use verb-first titles. Parse natural language dates relative to ${
      today || new Date().toISOString().split("T")[0]
    }. Estimate effort ∈ {5,15,30,60,120} and energy ∈ {low,med,high}. Infer importance (0–100), tags, and project if obvious. If compound, split into subtasks. Return STRICT JSON with keys: title, due_at (ISO 8601 or null), scheduled_for (ISO 8601 or null), effort_min, energy, tags[], project (or null), subtasks[], importance (0–100), notes_append (optional).`;

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
            { role: "user", content: textToSend },
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

    // Return validated response
    return NextResponse.json(parsedResponse, { status: 200 });
  } catch (error) {
    console.error("Error in /api/ai/clean_task:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}
