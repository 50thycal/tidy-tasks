import Link from "next/link";

export default function TopNav() {
  return (
    <nav
      style={{
        padding: "1rem 2rem",
        borderBottom: "1px solid #e0e0e0",
        display: "flex",
        gap: "2rem",
        alignItems: "center",
        backgroundColor: "#fff",
      }}
    >
      <Link
        href="/"
        style={{
          fontSize: "1.25rem",
          fontWeight: "600",
          textDecoration: "none",
          color: "#333",
        }}
      >
        Tidy
      </Link>
      <div style={{ display: "flex", gap: "1.5rem" }}>
        <Link
          href="/"
          style={{ textDecoration: "none", color: "#666" }}
        >
          Home
        </Link>
        <Link
          href="/inbox"
          style={{ textDecoration: "none", color: "#666" }}
        >
          Inbox
        </Link>
        <Link
          href="/settings"
          style={{ textDecoration: "none", color: "#666" }}
        >
          Settings
        </Link>
        <Link
          href="/focus"
          style={{ textDecoration: "none", color: "#666" }}
        >
          Focus
        </Link>
      </div>
    </nav>
  );
}
