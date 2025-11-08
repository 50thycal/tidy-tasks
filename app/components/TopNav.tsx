"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMetrics } from "@/src/hooks/useMetrics";

export default function TopNav() {
  const { metrics, loading } = useMetrics();
  const pathname = usePathname();

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
          aria-current={pathname === "/" ? "page" : undefined}
          style={{
            textDecoration: "none",
            color: "color-mix(in srgb, var(--text) 90%, transparent)",
            transition: "color 0.2s",
            minHeight: "44px",
            display: "flex",
            alignItems: "center",
            fontWeight: "500",
          }}
        >
          Home
        </Link>
        <Link
          href="/inbox"
          aria-current={pathname === "/inbox" ? "page" : undefined}
          style={{
            textDecoration: "none",
            color: "color-mix(in srgb, var(--text) 90%, transparent)",
            transition: "color 0.2s",
            minHeight: "44px",
            display: "flex",
            alignItems: "center",
            fontWeight: "500",
          }}
        >
          Inbox
        </Link>
        <Link
          href="/capture"
          aria-current={pathname === "/capture" ? "page" : undefined}
          style={{
            textDecoration: "none",
            color: "color-mix(in srgb, var(--text) 90%, transparent)",
            transition: "color 0.2s",
            minHeight: "44px",
            display: "flex",
            alignItems: "center",
            fontWeight: "500",
          }}
        >
          Capture
        </Link>
        <Link
          href="/focus"
          aria-current={pathname === "/focus" ? "page" : undefined}
          style={{
            textDecoration: "none",
            color: "color-mix(in srgb, var(--text) 90%, transparent)",
            transition: "color 0.2s",
            minHeight: "44px",
            display: "flex",
            alignItems: "center",
            fontWeight: "500",
          }}
        >
          Focus
        </Link>
        <Link
          href="/review"
          aria-current={pathname === "/review" ? "page" : undefined}
          style={{
            textDecoration: "none",
            color: "color-mix(in srgb, var(--text) 90%, transparent)",
            transition: "color 0.2s",
            minHeight: "44px",
            display: "flex",
            alignItems: "center",
            fontWeight: "500",
          }}
        >
          Review
        </Link>
        <Link
          href="/settings"
          aria-current={pathname === "/settings" ? "page" : undefined}
          style={{
            textDecoration: "none",
            color: "color-mix(in srgb, var(--text) 90%, transparent)",
            transition: "color 0.2s",
            minHeight: "44px",
            display: "flex",
            alignItems: "center",
            fontWeight: "500",
          }}
        >
          Settings
        </Link>
        <Link
          href="/about"
          aria-current={pathname === "/about" ? "page" : undefined}
          style={{
            textDecoration: "none",
            color: "color-mix(in srgb, var(--text) 90%, transparent)",
            transition: "color 0.2s",
            minHeight: "44px",
            display: "flex",
            alignItems: "center",
            fontWeight: "500",
          }}
        >
          About
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
