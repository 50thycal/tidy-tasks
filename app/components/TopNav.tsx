import Link from "next/link";

export default function TopNav() {
  return (
    <nav
      style={{
        padding: "1rem 2rem",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        gap: "2rem",
        alignItems: "center",
        backgroundColor: "var(--panel)",
      }}
    >
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
    </nav>
  );
}
