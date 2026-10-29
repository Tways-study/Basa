import { Check, CircleX, Clock, Loader2, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { JobStatus } from "@/lib/schemas";
import { describeStatus } from "@/lib/ui/scan-status";

// Each state pairs its color with an icon and a word, so it reads without color.
function StatusIcon({ status }: { status: JobStatus }) {
  switch (status) {
    case "queued":
      return <Clock aria-hidden="true" />;
    case "segmenting":
    case "reading":
    case "reconciling":
      return <Loader2 aria-hidden="true" className="motion-safe:animate-spin" />;
    case "needs_review":
      return <TriangleAlert aria-hidden="true" />;
    case "done":
      return <Check aria-hidden="true" />;
    case "failed":
      return <CircleX aria-hidden="true" />;
  }
}

export function StatusBadge({ status }: { status: JobStatus }) {
  const { label, tone } = describeStatus(status);
  return (
    <Badge variant={tone}>
      <StatusIcon status={status} />
      {label}
    </Badge>
  );
}
