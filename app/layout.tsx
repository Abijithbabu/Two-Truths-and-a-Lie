import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Two Truths and a Lie",
  description:
    "Play the party game Two Truths and a Lie with your hybrid team!",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
