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
      <body>
        <TopNav />
        {children}
      </body>
    </html>
  );
}
