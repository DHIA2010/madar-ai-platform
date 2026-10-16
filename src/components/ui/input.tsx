import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        data-slot="input"
        className={cn(
          "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
          // Chrome/Edge force their own pale-blue/yellow fill on autofilled fields, ignoring
          // bg-transparent -- the only reliable override is this inset-shadow trick (painting a
          // solid color back over the UA fill) plus a near-infinite transition delay so the
          // browser's own color-swap animation never gets a chance to show through. White, not
          // var(--background) (the page's own off-white #f5f7fb) -- inputs almost always sit on a
          // white card/panel, and the page's slightly gray tone read as a dirty, unclear fill
          // against that white surroundings.
          "[&:-webkit-autofill]:[-webkit-text-fill-color:var(--foreground)] [&:-webkit-autofill]:shadow-[inset_0_0_0px_1000px_white] [&:-webkit-autofill]:[transition:background-color_9999s_ease-in-out_0s] [&:-webkit-autofill:focus]:shadow-[inset_0_0_0px_1000px_white] [&:-webkit-autofill:hover]:shadow-[inset_0_0_0px_1000px_white]",
          className
        )}
        {...props}
      />
    )
  }
)

Input.displayName = "Input"

export { Input }
