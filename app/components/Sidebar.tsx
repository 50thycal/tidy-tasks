"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMetrics } from "@/src/hooks/useMetrics";

const NAV_ITEMS = [
  { href: "/inbox", label: "Inbox", icon: "📥" },
  { href: "/capture", label: "Capture", icon: "✏️" },
  { href: "/focus", label: "Focus", icon: "🎯" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { metrics, loading } = useMetrics();

  return (
    <aside
      style={{
        width: "240px",
        display: "none",
        flexDirection: "column",
        borderRight: "1px solid var(--border)",
        backgroundColor: "var(--panel)",
      }}
      className="md:flex"
    >
      {/* Header */}
      <div
        style={{
          padding: "1.5rem 1rem",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ fontSize: "1.25rem", fontWeight: "600", color: "var(--text)", marginBottom: "0.25rem" }}>
          Tidy Tasks
        </div>
        <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
          AI-assisted task flow
        </div>
      </div>

      {/* Navigation */}
      <nav
        style={{
          flex: 1,
          padding: "0.75rem 0.5rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.25rem",
        }}
      >
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                padding: "0.625rem 0.75rem",
                borderRadius: "6px",
                textDecoration: "none",
                fontSize: "0.875rem",
                fontWeight: "500",
                transition: "all 0.15s",
                backgroundColor: active ? "var(--panel-2)" : "transparent",
                color: active ? "var(--text)" : "var(--muted)",
                boxShadow: active ? "0 1px 3px rgba(0, 0, 0, 0.1)" : "none",
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  e.currentTarget.style.backgroundColor = "color-mix(in srgb, var(--panel-2) 50%, transparent)";
                  e.currentTarget.style.color = "var(--text)";
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  e.currentTarget.style.backgroundColor = "transparent";
                  e.currentTarget.style.color = "var(--muted)";
                }
              }}
            >
              <span style={{ fontSize: "1.125rem" }}>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer with metrics */}
      <div
        style={{
          padding: "1rem",
          borderTop: "1px solid var(--border)",
        }}
      >
        {loading ? (
          <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>Loading stats...</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: "0.75rem",
                color: "var(--muted)",
              }}
            >
              <span>Tasks completed</span>
              <span style={{ fontWeight: "600", color: "var(--accent-2)" }}>
                {metrics.tasksCompleted}
              </span>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: "0.75rem",
                color: "var(--muted)",
              }}
            >
              <span>AI cleanups</span>
              <span style={{ fontWeight: "600", color: "var(--accent)" }}>
                {metrics.aiCleans}
              </span>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
