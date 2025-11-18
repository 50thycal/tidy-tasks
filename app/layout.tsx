import type { Metadata, Viewport } from "next";
import { AppShell } from "./components/AppShell";
import DigestScheduler from "./components/DigestScheduler";
import RegisterSW from "./register-sw";
import SwListener from "./sw-listener";
import EnvBanner from "./components/EnvBanner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tidy",
  description: "Lightweight AI-assisted task tracking app",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Tidy",
  },
  icons: {
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0b0d",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[var(--bg)] text-[var(--text)] antialiased">
        <RegisterSW />
        <SwListener />
        <DigestScheduler />
        <EnvBanner />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
