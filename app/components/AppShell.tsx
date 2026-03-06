"use client";

import React from "react";
import { Sidebar } from "./Sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        backgroundColor: "var(--background)",
        color: "var(--text)",
        flexDirection: "column",
      }}
      className="md:flex-row"
    >
      {/* Sidebar renders both mobile top nav (sticky at top) and desktop sidebar (sticky, side by side) */}
      <Sidebar />

      {/* Main content */}
      <main
        style={{
          flex: 1,
          overflowY: "auto",
        }}
      >
        <div
          style={{
            maxWidth: "1200px",
            margin: "0 auto",
            padding: "1rem",
          }}
          className="sm:px-6 sm:py-6"
        >
          {children}
        </div>
      </main>
    </div>
  );
}
