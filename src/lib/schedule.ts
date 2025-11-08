/**
 * Scheduling utilities for Tidy Tasks
 * Handles daily digest scheduling
 */

export interface ScheduleHandle {
  cancel: () => void;
}

/**
 * Parse time string (HH:MM) to hours and minutes
 */
function parseTime(timeHHMM: string): { hours: number; minutes: number } {
  const [hoursStr, minutesStr] = timeHHMM.split(":");
  return {
    hours: parseInt(hoursStr, 10) || 0,
    minutes: parseInt(minutesStr, 10) || 0,
  };
}

/**
 * Get next occurrence of a specific time in a timezone
 */
function getNextOccurrence(timeHHMM: string, timezone: string): Date {
  const { hours, minutes } = parseTime(timeHHMM);

  // Get current time in the target timezone
  const now = new Date();
  const nowInTz = new Date(
    now.toLocaleString("en-US", { timeZone: timezone })
  );

  // Create target time today in the timezone
  const target = new Date(nowInTz);
  target.setHours(hours, minutes, 0, 0);

  // If target time has passed today, schedule for tomorrow
  if (target <= nowInTz) {
    target.setDate(target.getDate() + 1);
  }

  return target;
}

/**
 * Schedule a function to run daily at a specific time in a timezone
 */
export function scheduleDaily(
  fn: () => void,
  timeHHMM: string,
  timezone: string
): ScheduleHandle {
  let timeoutId: NodeJS.Timeout | null = null;
  let intervalId: NodeJS.Timeout | null = null;

  const schedule = () => {
    const next = getNextOccurrence(timeHHMM, timezone);
    const now = new Date();
    const msUntilNext = next.getTime() - now.getTime();

    console.log(
      `[Scheduler] Next digest scheduled for ${next.toLocaleString("en-US", {
        timeZone: timezone,
      })} (in ${Math.round(msUntilNext / 1000 / 60)} minutes)`
    );

    // Schedule first occurrence
    timeoutId = setTimeout(() => {
      fn();

      // Then schedule daily interval
      intervalId = setInterval(() => {
        fn();
      }, 24 * 60 * 60 * 1000); // 24 hours
    }, msUntilNext);
  };

  schedule();

  return {
    cancel: () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      console.log("[Scheduler] Cancelled daily digest");
    },
  };
}

/**
 * Check if we need to show a catch-up digest
 * (if lastDigestDate < today)
 */
export function needsCatchUp(lastDigestDate: string | null, timezone: string): boolean {
  if (!lastDigestDate) return true;

  const now = new Date();
  const todayStr = now.toLocaleDateString("en-CA", { timeZone: timezone }); // YYYY-MM-DD

  return lastDigestDate < todayStr;
}
