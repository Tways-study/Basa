import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Page not found | Basa" };

export default function NotFound() {
  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-5xl px-4 pt-6 pb-12 outline-none sm:px-6 sm:pt-10">
      <div className="flex max-w-xl flex-col items-start gap-4">
        <h1 className="text-3xl font-semibold">We can&apos;t find that page</h1>
        <p>Check the link, or take a photo of a chart to start a scan.</p>
        <Button asChild>
          <Link href="/">Photograph a chart</Link>
        </Button>
      </div>
    </main>
  );
}
