/**
 * Metrics tracking for Tidy app
 * Uses localStorage for simple, privacy-safe counters
 */

export interface Metrics {
  id: 'global';
  tasksCreated: number;
  tasksCompleted: number;
  aiCleans: number;
  aiPrioritizations: number;
  aiAddNotes: number;
  updatedAt: string; // ISO
}

const METRICS_KEY = "tidy.metrics";

const DEFAULT_METRICS: Metrics = {
  id: 'global',
  tasksCreated: 0,
  tasksCompleted: 0,
  aiCleans: 0,
  aiPrioritizations: 0,
  aiAddNotes: 0,
  updatedAt: new Date().toISOString(),
};

/**
 * Get metrics, initializing defaults if missing
 */
export async function getMetrics(): Promise<Metrics> {
  if (typeof window === "undefined") return DEFAULT_METRICS;

  try {
    const stored = localStorage.getItem(METRICS_KEY);
    if (!stored) {
      // Initialize defaults
      localStorage.setItem(METRICS_KEY, JSON.stringify(DEFAULT_METRICS));
      return DEFAULT_METRICS;
    }

    const metrics = JSON.parse(stored) as Metrics;
    return metrics;
  } catch (error) {
    console.error("Error reading metrics:", error);
    return DEFAULT_METRICS;
  }
}

/**
 * Increment a specific metric counter
 */
export async function inc(key: keyof Pick<Metrics, 'tasksCreated' | 'tasksCompleted' | 'aiCleans' | 'aiPrioritizations' | 'aiAddNotes'>): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    const metrics = await getMetrics();
    metrics[key] = metrics[key] + 1;
    metrics.updatedAt = new Date().toISOString();
    localStorage.setItem(METRICS_KEY, JSON.stringify(metrics));
  } catch (error) {
    console.error(`Error incrementing ${key}:`, error);
  }
}

/**
 * Reset all metrics to defaults
 */
export async function reset(): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    const resetMetrics: Metrics = {
      ...DEFAULT_METRICS,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(METRICS_KEY, JSON.stringify(resetMetrics));
  } catch (error) {
    console.error("Error resetting metrics:", error);
  }
}
