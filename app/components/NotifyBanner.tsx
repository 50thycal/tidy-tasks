"use client";

import { useState } from "react";
import { requestPermission, dismissBanner, shouldShowBanner } from "@/src/lib/notify";

interface NotifyBannerProps {
  onEnable?: () => void;
}

export default function NotifyBanner({ onEnable }: NotifyBannerProps) {
  const [show, setShow] = useState(shouldShowBanner());

  if (!show) return null;

  const handleEnable = async () => {
    const permission = await requestPermission();
    if (permission === "granted") {
      setShow(false);
      if (onEnable) {
        onEnable();
      }
    } else {
      // Permission denied, hide banner
      dismissBanner();
      setShow(false);
    }
  };

  const handleDismiss = () => {
    dismissBanner();
    setShow(false);
  };

  return (
    <div
      style={{
        backgroundColor: "color-mix(in srgb, var(--accent) 15%, transparent)",
        border: "1px solid var(--accent)",
        borderRadius: "8px",
        padding: "1rem 1.5rem",
        marginBottom: "1.5rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "1rem",
        flexWrap: "wrap",
      }}
    >
      <div style={{ flex: "1", minWidth: "200px" }}>
        <div style={{ fontWeight: "500", marginBottom: "0.25rem", color: "var(--text)" }}>
          Enable notifications to get a Daily Digest and reminders
        </div>
        <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
          Local-only. No data leaves your device.
        </div>
      </div>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button
          onClick={handleEnable}
          className="btn btn-primary"
          style={{
            padding: "0.5rem 1rem",
            fontSize: "0.9rem",
          }}
        >
          Enable
        </button>
        <button
          onClick={handleDismiss}
          style={{
            padding: "0.5rem 1rem",
            backgroundColor: "transparent",
            color: "var(--text)",
            border: "1px solid var(--border)",
            borderRadius: "4px",
            fontSize: "0.9rem",
            cursor: "pointer",
          }}
        >
          Not now
        </button>
      </div>
    </div>
  );
}
