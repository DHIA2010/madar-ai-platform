import { describe, expect, it } from "vitest"

import { buttonVariants } from "./button"

describe("buttonVariants contrast safety", () => {
  it("keeps paired foreground/background tokens for interactive variants", () => {
    const primary = buttonVariants({ variant: "default" })
    expect(primary).toContain("text-primary-foreground")
    expect(primary).toContain("hover:text-primary-foreground")

    const secondary = buttonVariants({ variant: "secondary" })
    expect(secondary).toContain("text-secondary-foreground")
    expect(secondary).toContain("hover:text-secondary-foreground")

    const destructive = buttonVariants({ variant: "destructive" })
    expect(destructive).toContain("text-destructive-foreground")
    expect(destructive).toContain("hover:text-destructive-foreground")

    const success = buttonVariants({ variant: "success" })
    expect(success).toContain("text-white")
    expect(success).toContain("hover:text-white")

    const warning = buttonVariants({ variant: "warning" })
    expect(warning).toContain("text-amber-950")
    expect(warning).toContain("hover:text-amber-950")
  })

  it("keeps readable foreground for surface variants", () => {
    const outline = buttonVariants({ variant: "outline" })
    expect(outline).toContain("text-foreground")
    expect(outline).toContain("hover:text-foreground")

    const ghost = buttonVariants({ variant: "ghost" })
    expect(ghost).toContain("text-foreground")
    expect(ghost).toContain("hover:text-foreground")
  })
})
