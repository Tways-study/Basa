"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * The way out of the review screen. With nothing unsaved it is a plain link. With unsaved answers it asks
 * first, and says they stay on this device (review-draft.ts keeps them), so leaving never loses work.
 */
export function BackHome({ dirty, className }: { dirty: boolean; className?: string }) {
  const [open, setOpen] = useState(false);

  if (!dirty) {
    return (
      <Button asChild variant="outline" className={className}>
        <Link href="/">
          <ArrowLeft aria-hidden="true" />
          Back to home
        </Link>
      </Button>
    );
  }

  return (
    <>
      <Button variant="outline" className={className} onClick={() => setOpen(true)}>
        <ArrowLeft aria-hidden="true" />
        Back to home
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Leave without confirming?</DialogTitle>
            <DialogDescription>
              The record is not confirmed yet. Your answers stay on this device and will be here when you open this scan again.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button asChild variant="outline">
              <Link href="/">Leave</Link>
            </Button>
            <Button autoFocus onClick={() => setOpen(false)}>
              Stay and keep reviewing
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
