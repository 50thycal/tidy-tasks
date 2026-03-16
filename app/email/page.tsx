"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function EmailPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/inbox");
  }, [router]);

  return (
    <div style={{ padding: "2rem", textAlign: "center" }}>
      <p style={{ color: "var(--muted)" }}>Redirecting to Inbox...</p>
    </div>
  );
}
