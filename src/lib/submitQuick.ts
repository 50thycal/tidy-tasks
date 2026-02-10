import type { CleanTaskResponse } from "@/src/types";

/**
 * Submit a quick task - either as raw text or cleaned with AI
 */
export async function submitQuick(
  rawText: string,
  options: {
    useAI: boolean;
    timezone?: string;
    onSuccess?: (result: CleanTaskResponse) => void;
    onError?: (error: Error) => void;
  }
): Promise<CleanTaskResponse | null> {
  const trimmed = rawText.trim();
  if (!trimmed) {
    throw new Error("Task text cannot be empty");
  }

  try {
    if (options.useAI) {
      // Call AI clean endpoint
      const response = await fetch("/api/ai/clean_task", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-No-Train": "true",
        },
        body: JSON.stringify({
          raw_text: trimmed,
          timezone: options.timezone || "America/Los_Angeles",
          today: new Date().toISOString().split("T")[0],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const result: CleanTaskResponse = await response.json();
      options.onSuccess?.(result);
      return result;
    } else {
      // Create minimal task without AI
      const result: CleanTaskResponse = {
        title: trimmed,
        due_at: null,
        effort_min: 15,
        energy: "med",
        tags: [],
        project: null,
        subtasks: [],
        importance: 50,
      };

      options.onSuccess?.(result);
      return result;
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    options.onError?.(err);
    return null;
  }
}
