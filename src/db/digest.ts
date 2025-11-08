/**
 * Digest storage using localStorage
 * Stores daily digests by date
 */

import type { Digest } from "@/src/lib/digest";

const STORAGE_KEY = "tidy.digests";
const LAST_DIGEST_KEY = "tidy.lastDigestDate";

export interface DigestRow {
  id: string; // YYYY-MM-DD
  createdAt: string; // ISO timestamp
  counts: {
    overdue: number;
    dueToday: number;
    dueNext7: number;
    staleActive: number;
  };
  text: string;
  seen: boolean;
}

/**
 * Get all digests from localStorage
 */
function getAllDigests(): Record<string, DigestRow> {
  if (typeof window === "undefined") return {};

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return {};

    const digests = JSON.parse(stored);
    return typeof digests === "object" ? digests : {};
  } catch (error) {
    console.error("Error reading digests:", error);
    return {};
  }
}

/**
 * Save all digests to localStorage
 */
function saveAllDigests(digests: Record<string, DigestRow>): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(digests));
  } catch (error) {
    console.error("Error saving digests:", error);
  }
}

/**
 * Save a digest
 */
export function saveDigest(digest: Digest): void {
  const digests = getAllDigests();

  const row: DigestRow = {
    id: digest.date,
    createdAt: digest.ts,
    counts: digest.counts,
    text: digest.text,
    seen: false,
  };

  digests[digest.date] = row;
  saveAllDigests(digests);

  // Update last digest date
  setLastDigestDate(digest.date);
}

/**
 * Get a digest by date (YYYY-MM-DD)
 */
export function getDigest(date: string): DigestRow | null {
  const digests = getAllDigests();
  return digests[date] || null;
}

/**
 * Get last digest date
 */
export function getLastDigestDate(): string | null {
  if (typeof window === "undefined") return null;

  try {
    return localStorage.getItem(LAST_DIGEST_KEY);
  } catch (error) {
    console.error("Error reading last digest date:", error);
    return null;
  }
}

/**
 * Set last digest date
 */
function setLastDigestDate(date: string): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(LAST_DIGEST_KEY, date);
  } catch (error) {
    console.error("Error saving last digest date:", error);
  }
}

/**
 * Mark digest as seen
 */
export function markSeen(date: string): void {
  const digests = getAllDigests();
  if (digests[date]) {
    digests[date].seen = true;
    saveAllDigests(digests);
  }
}

/**
 * Get today's digest (if exists)
 */
export function getTodayDigest(timezone: string): DigestRow | null {
  const now = new Date();
  const todayStr = now.toLocaleDateString("en-CA", { timeZone: timezone }); // YYYY-MM-DD
  return getDigest(todayStr);
}

/**
 * Clear all digests (for testing)
 */
export function clearAllDigests(): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LAST_DIGEST_KEY);
  } catch (error) {
    console.error("Error clearing digests:", error);
  }
}
