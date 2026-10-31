import { notFound } from "next/navigation";
import { ReviewWorkspace } from "@/components/scan/review-workspace";
import { previewScan } from "@/lib/ui/preview-fixture";

// Design preview: the review screen on sample data, no API and no database. Not shipped to Production.
export default function ReviewPreview() {
  if (process.env.NODE_ENV === "production") notFound();

  const scan = previewScan();
  return (
    <main className="mx-auto w-full max-w-5xl px-4 pt-6 pb-12 sm:px-6 sm:pt-10">
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          <h1 className="text-4xl font-semibold tracking-tight">Review the scan</h1>
          <p className="max-w-[60ch] text-muted-foreground">
            Design preview with sample data. Nothing here is sent or saved.
          </p>
        </header>
        <ReviewWorkspace scan={scan} photoUrl={scan.imageUrl} preview />
      </div>
    </main>
  );
}
