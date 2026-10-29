import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ScanResults } from "@/components/scan/scan-results";
import { ScanSkeleton } from "@/components/scan/scan-skeleton";
import { Button } from "@/components/ui/button";
import { ScanIdSchema } from "@/lib/schemas";

export const metadata: Metadata = { title: "Scan results | Basa" };

// With cacheComponents, reading params is request-time work, so it sits inside Suspense
// and the rest of the page (shell and skeleton) can be served immediately.
async function ScanView({ params }: { params: Promise<{ id: string }> }) {
  const id = ScanIdSchema.safeParse((await params).id);

  if (!id.success) {
    return (
      <div className="flex max-w-xl flex-col items-start gap-4">
        <h1 className="text-3xl font-semibold">That is not a scan link</h1>
        <p>Check the link, or take a new photo to start a scan.</p>
        <Button asChild>
          <Link href="/">Photograph a chart</Link>
        </Button>
      </div>
    );
  }

  return <ScanResults scanId={id.data} />;
}

export default function ScanPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 pt-6 pb-12 sm:px-6 sm:pt-10">
      <Suspense fallback={<ScanSkeleton />}>
        <ScanView params={params} />
      </Suspense>
    </main>
  );
}
