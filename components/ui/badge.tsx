import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

// Color carries meaning only (CLAUDE.md). Each variant is used with an icon and a text
// label, so meaning never rests on color alone. Amber is a fill with ink text: amber
// text on paper is only about 3.2:1, below AA.
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1.5 rounded-md border border-transparent px-2.5 py-1 text-sm font-medium whitespace-nowrap transition-colors duration-200 [&>svg]:pointer-events-none [&>svg]:size-4",
  {
    variants: {
      variant: {
        // Work still happening, nothing to decide yet.
        progress: "border-ink/40 bg-transparent text-foreground",
        // Models agreed.
        verified: "bg-verified text-paper",
        // Needs a human.
        flag: "bg-flag text-ink",
        // Unreadable or failed.
        stamp: "bg-stamp text-paper",
      },
    },
    defaultVariants: {
      variant: "progress",
    },
  }
)

function Badge({
  className,
  variant = "progress",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
