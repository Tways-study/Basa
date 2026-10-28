import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Basa",
  description: "Photographed paper clinic charts, verified by a person.",
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
