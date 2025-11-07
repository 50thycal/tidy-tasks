import { NextRequest, NextResponse } from "next/server";
import type { WeeklySummaryRequest, WeeklySummaryResponse, WeeklySummaryTask } from "@/src/types";

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json() as WeeklySummaryRequest;

    const { week_start, week_end, timezone, tasks } = body;

    if (!week_start || !week_end || !tasks) {
      return NextResponse.json(
        { error: "Missing required fields: week_start, week_end, tasks" },
        { status: 400 }
      );
    }

    // Filter tasks for the week window
    const weekStartDate = new Date(week_start + "T00:00:00");
    const weekEndDate = new Date(week_end + "T23:59:59");

    const done = tasks.filter((t) => {
      if (t.status !== "done") return false;
      if (!t.updated_at) return false;
      const updatedDate = new Date(t.updated_at);
      return updatedDate >= weekStartDate && updatedDate <= weekEndDate;
    });

    const overdue_active = tasks.filter((t) => {
      if (t.status !== "active") return false;
      if (!t.due_at) return false;
      const dueDate = new Date(t.due_at);
      return dueDate < weekEndDate;
    });

    const upcoming = tasks.filter((t) => {
      if (t.status === "done") return false;
      if (!t.due_at) return false;
      const dueDate = new Date(t.due_at);
      const nextWeekEnd = new Date(weekEndDate);
      nextWeekEnd.setDate(nextWeekEnd.getDate() + 7);
      return dueDate > weekEndDate && dueDate <= nextWeekEnd;
    });

    const high_importance = tasks
      .filter((t) => t.status !== "done" && t.importance !== undefined)
      .sort((a, b) => (b.importance || 0) - (a.importance || 0))
      .slice(0, 5);

    // Calculate activity counts
    const created = tasks.filter((t) => {
      if (!t.created_at) return false;
      const createdDate = new Date(t.created_at);
      return createdDate >= weekStartDate && createdDate <= weekEndDate;
    }).length;

    const completed = done.length;

    // Construct context object for AI
    const context = {
      week: `${week_start} to ${week_end}`,
      done: done.map((t) => ({
        title: t.title,
        project: t.project,
        effort_min: t.effort_min,
        tags: t.tags,
      })),
      overdue_active: overdue_active.map((t) => ({
        title: t.title,
        project: t.project,
        due_at: t.due_at,
      })),
      activity_counts: {
        created,
        completed,
      },
      high_importance: high_importance.map((t) => ({
        title: t.title,
        importance: t.importance,
        project: t.project,
      })),
      upcoming: upcoming.map((t) => ({
        title: t.title,
        due_at: t.due_at,
        project: t.project,
      })),
    };

    // If no activity, return empty state message
    if (done.length === 0 && overdue_active.length === 0 && created === 0) {
      return NextResponse.json({
        title: "Quiet Week",
        wins: "• No completed tasks this week",
        stuck: "• No active blockers identified",
        next_focus: "• Consider planning some tasks for the upcoming week",
      } as WeeklySummaryResponse, { status: 200 });
    }

    // Prepare system prompt
    const systemPrompt = `You are a concise weekly task summary assistant. Analyze the provided task data and generate a brief weekly summary.

Rules:
- Be concise and practical (3 short bullets per section max)
- Use only the provided data; do not invent information
- Output valid JSON matching this schema:
{
  "title": "brief heading for the week (e.g., 'Productive Week', 'Mixed Progress')",
  "wins": "1-3 bullet points with '• ' prefix, newline separated",
  "stuck": "risks/blockers as bullets, or '• No major blockers' if none",
  "next_focus": "concrete action plan for next week as bullets"
}

Tone: Supportive, professional, actionable.
Timezone: ${timezone || "UTC"}`;

    const userPrompt = `Week: ${context.week}

Completed tasks (${context.done.length}):
${context.done.map((t) => `- ${t.title}${t.project ? ` [${t.project}]` : ""}${t.effort_min ? ` (${t.effort_min}min)` : ""}`).join("\n") || "None"}

Overdue active tasks (${context.overdue_active.length}):
${context.overdue_active.map((t) => `- ${t.title}${t.project ? ` [${t.project}]` : ""}`).join("\n") || "None"}

High-priority tasks:
${context.high_importance.map((t) => `- ${t.title} (importance: ${t.importance})`).join("\n") || "None"}

Upcoming (next 7 days):
${context.upcoming.map((t) => `- ${t.title} (due: ${t.due_at})`).join("\n") || "None"}

Activity: Created ${context.activity_counts.created}, Completed ${context.activity_counts.completed}`;

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
        { status: 502 }
      );
    }

    const openaiData = await openaiResponse.json();
    const content = openaiData.choices?.[0]?.message?.content;

    if (!content) {
      return NextResponse.json(
        { error: "No content in OpenAI response" },
        { status: 502 }
      );
    }

    // Parse JSON response
    let parsedResponse: WeeklySummaryResponse;
    try {
      parsedResponse = JSON.parse(content);
    } catch (e) {
      return NextResponse.json(
        { error: "Failed to parse OpenAI JSON response", details: content },
        { status: 502 }
      );
    }

    // Validate response has required fields
    if (!parsedResponse.title || !parsedResponse.wins || !parsedResponse.stuck || !parsedResponse.next_focus) {
      return NextResponse.json(
        { error: "Invalid response format from AI", raw: parsedResponse },
        { status: 502 }
      );
    }

    // Return validated response
    return NextResponse.json(parsedResponse, { status: 200 });
  } catch (error) {
    console.error("Error in /api/ai/weekly_summary:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}
