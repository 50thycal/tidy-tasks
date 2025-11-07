import type { Metadata } from "next";
import TopNav from "./components/TopNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tidy",
  description: "Lightweight AI-assisted task tracking app",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[var(--bg)] text-[var(--text)] antialiased">
        <TopNav />
        <div className="min-h-screen">{children}</div>
      </body>
    </html>
  );
}
