"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getMetrics, type Metrics } from "@/src/db/metrics";

const DEFAULT_METRICS: Metrics = {
  id: 'global',
  tasksCreated: 0,
  tasksCompleted: 0,
  aiCleans: 0,
  aiPrioritizations: 0,
  aiAddNotes: 0,
  updatedAt: new Date().toISOString(),
};

export function useMetrics() {
  const [metrics, setMetrics] = useState<Metrics>(DEFAULT_METRICS);
  const [loading, setLoading] = useState(true);
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const loadMetrics = useCallback(async () => {
    try {
      const data = await getMetrics();
      setMetrics(data);
    } catch (error) {
      console.error("Error loading metrics:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced refresh to avoid thrashing
  const refresh = useCallback(() => {
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
    }

    refreshTimeoutRef.current = setTimeout(() => {
      loadMetrics();
    }, 300); // 300ms debounce
  }, [loadMetrics]);

  // Load on mount
  useEffect(() => {
    loadMetrics();

    // Cleanup timeout on unmount
    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, [loadMetrics]);

  return { metrics, loading, refresh };
}
