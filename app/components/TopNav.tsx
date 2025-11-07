"use client";

import Link from "next/link";
import { useMetrics } from "@/src/hooks/useMetrics";

export default function TopNav() {
  const { metrics, loading } = useMetrics();

  return (
    <nav
      style={{
        padding: "1rem 2rem",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        gap: "2rem",
        alignItems: "center",
        backgroundColor: "var(--panel)",
        justifyContent: "space-between",
      }}
    >
      <div style={{ display: "flex", gap: "2rem", alignItems: "center" }}>
        <Link
          href="/"
          style={{
            fontSize: "1.25rem",
            fontWeight: "600",
            textDecoration: "none",
            color: "var(--text)",
          }}
        >
          Tidy
        </Link>
        <div style={{ display: "flex", gap: "1.5rem" }}>
        <Link
          href="/"
          style={{
            textDecoration: "none",
            color: "color-mix(in srgb, var(--text) 90%, transparent)",
            transition: "color 0.2s",
          }}
        >
          Home
        </Link>
        <Link
          href="/inbox"
          style={{
            textDecoration: "none",
            color: "color-mix(in srgb, var(--text) 90%, transparent)",
            transition: "color 0.2s",
          }}
        >
          Inbox
        </Link>
        <Link
          href="/capture"
          style={{
            textDecoration: "none",
            color: "color-mix(in srgb, var(--text) 90%, transparent)",
            transition: "color 0.2s",
          }}
        >
          Capture
        </Link>
        <Link
          href="/focus"
          style={{
            textDecoration: "none",
            color: "color-mix(in srgb, var(--text) 90%, transparent)",
            transition: "color 0.2s",
          }}
        >
          Focus
        </Link>
        <Link
          href="/review"
          style={{
            textDecoration: "none",
            color: "color-mix(in srgb, var(--text) 90%, transparent)",
            transition: "color 0.2s",
          }}
        >
          Review
        </Link>
        <Link
          href="/settings"
          style={{
            textDecoration: "none",
            color: "color-mix(in srgb, var(--text) 90%, transparent)",
            transition: "color 0.2s",
          }}
        >
          Settings
        </Link>
        </div>
      </div>

      {/* Metrics badges */}
      <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
        {loading ? (
          <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>Loading...</span>
        ) : (
          <>
            <div
              style={{
                padding: "0.25rem 0.75rem",
                backgroundColor: "color-mix(in srgb, var(--accent-2) 15%, transparent)",
                color: "var(--accent-2)",
                borderRadius: "12px",
                fontSize: "0.85rem",
                fontWeight: "500",
                border: "1px solid var(--border)",
              }}
            >
              ✅ {metrics.tasksCompleted}
            </div>
            <div
              style={{
                padding: "0.25rem 0.75rem",
                backgroundColor: "color-mix(in srgb, var(--accent) 15%, transparent)",
                color: "var(--accent)",
                borderRadius: "12px",
                fontSize: "0.85rem",
                fontWeight: "500",
                border: "1px solid var(--border)",
              }}
            >
              ✨ {metrics.aiCleans}
            </div>
          </>
        )}
      </div>
    </nav>
  );
}
