import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Fraunces, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { BasaMark } from "@/components/brand/basa-mark";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Basa",
  description:
    "Basa is Filipino for “read”. Photographed paper clinic charts, read twice by AI and confirmed by a person. Built in the Philippines.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f4efe6",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${plexSans.variable} ${plexMono.variable}`}
    >
      <body>
        <header className="mx-auto flex w-full max-w-5xl items-center px-4 pt-4 sm:px-6">
          <Link
            href="/"
            className="-mx-2 inline-flex min-h-11 items-center gap-2 px-2 font-display text-2xl font-semibold tracking-tight"
          >
            <BasaMark className="size-7 shrink-0" />
            Basa
          </Link>
        </header>
        {children}
      </body>
    </html>
  );
}
