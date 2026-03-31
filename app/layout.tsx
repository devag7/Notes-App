import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Markdown Notes App",
  description: "Write markdown notes with tags, search, and live preview.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
