import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

// #324: `weight` picks the line. "dense" (1px, the default) for fields inside
// multi-field forms; "frame" (3px) for standalone fields — search, sort,
// passphrase, recovery code.
const FIELD_WEIGHT = {
  dense: "border border-input",
  frame: "border-3 border-frame",
} as const

function Input({
  className,
  type,
  weight = "dense",
  ...props
}: React.ComponentProps<"input"> & { weight?: keyof typeof FIELD_WEIGHT }) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      data-weight={weight}
      className={cn(
        "h-8 w-full min-w-0 rounded-lg bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        FIELD_WEIGHT[weight],
        weight === "frame" && "h-11",
        className
      )}
      {...props}
    />
  )
}

export { Input, FIELD_WEIGHT }
