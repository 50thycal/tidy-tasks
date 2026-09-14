import { NextRequest, NextResponse } from "next/server";
import { inc } from "@/src/db/metrics";
import { hit, clientKey } from "@/src/lib/ratelimit";

/**
 * Draft a short follow-up message (Teams or email) for one waiting-on item.
 * Body: { owner, items: [{title, since, due, context}], project, channel, my_name, tone }
 * Returns: { message: string, subject: string | null }
 */
export async function POST(request: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "Server not configured: OPENAI_API_KEY missing." }, { status: 503 });
  }
  const key = `${clientKey(request)}:/api/ai/draft_nudge`;
  const { allowed, resetMs } = hit(key, 15, 60_000);
  if (!allowed) {
    return new Response(JSON.stringify({ error: "Rate limit: try again shortly." }), {
      status: 429,
      headers: { "content-type": "application/json", "retry-after": String(Math.ceil(resetMs / 1000)) },
    });
  }

  try {
    const body = await request.json();
    const owner = String(body.owner ?? "").slice(0, 80);
    const items = Array.isArray(body.items) ? body.items.slice(0, 8) : [];
    const project = body.project ? String(body.project).slice(0, 80) : null;
    const channel = body.channel === "email" ? "email" : "teams";
    const myName = body.my_name ? String(body.my_name).slice(0, 60) : null;
    const tone = body.tone === "firm" ? "firm" : "friendly";
    if (!owner || items.length === 0) {
      return NextResponse.json({ error: "owner and at least one item are required" }, { status: 422 });
    }

    const list = items
      .map((it: any) => `- ${String(it.title ?? "").slice(0, 200)}${it.since ? ` (waiting since ${it.since})` : ""}${it.due ? ` (needed by ${it.due})` : ""}${it.context ? `\n  context: ${String(it.context).slice(0, 300)}` : ""}`)
      .join("\n");

    const systemPrompt = `You write short follow-up messages for a substation design project manager at Burns & McDonnell${myName ? ` named ${myName}` : ""}. Client is ITC. Messages go to colleagues, client engineers, or vendors.

Write a ${channel === "email" ? "brief email" : "Teams chat message"} to ${owner}${project ? ` about the ${project} project` : ""} asking for status on the items below. Tone: ${tone === "firm" ? "polite but direct; these are overdue and blocking the schedule" : "friendly and low-pressure"}.

Rules: 2-5 sentences. No greeting fluff beyond a first name. Reference each item concretely. If a needed-by date exists, mention it. End with one clear ask. Do not invent facts. ${channel === "email" ? 'Return JSON {"subject": string, "message": string}.' : 'Return JSON {"subject": null, "message": string}.'}

Items:
${list}`;

    const modelName = process.env.MODEL_NAME || "gpt-4o-mini";
    const payload = {
      model: modelName,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: "Draft it." },
      ],
      response_format: { type: "json_object" as const },
      temperature: 0.4,
    };

    if (process.env.NODE_ENV === "development") {
      const url = new URL(request.url);
      if (url.searchParams.get("debug") === "1" || request.headers.get("x-debug-ai") === "1") {
        return NextResponse.json({ debug: true, payload });
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
    let parsed: any = {};
    try {
      parsed = JSON.parse(content ?? "{}");
    } catch {
      return NextResponse.json({ error: "AI returned an invalid response. Please try again." }, { status: 502 });
    }
    const message = String(parsed.message ?? "").trim().slice(0, 2000);
    if (!message) return NextResponse.json({ error: "Empty draft" }, { status: 502 });
    await inc("aiCleans");
    return NextResponse.json({ message, subject: parsed.subject ? String(parsed.subject).slice(0, 200) : null });
  } catch (error) {
    console.error("Error in /api/ai/draft_nudge:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
