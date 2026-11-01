"use client";

import Link from "next/link";
import { useEffect } from "react";
import { CircleX } from "lucide-react";
import { Button } from "@/components/ui/button";

// The last safety net: a screen that crashed while rendering. The person's photos are safe in the outbox,
// so say so, and give a way to try again or start over.
export default function RouteError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error("screen crashed:", error instanceof Error ? error.name : "unknown error");
  }, [error]);

  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-5xl px-4 pt-6 pb-12 outline-none sm:px-6 sm:pt-10">
      <div className="flex max-w-xl flex-col items-start gap-4">
        <h1 className="text-3xl font-semibold">Something went wrong on this screen</h1>
        <p role="alert" className="flex items-start gap-2">
          <CircleX aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-stamp" />
          <span>Photos you already took are saved on this device and are not lost. Try again, or go back to the camera.</span>
        </p>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => retry()}>Try again</Button>
          <Button asChild variant="outline">
            <Link href="/">Photograph a chart</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
