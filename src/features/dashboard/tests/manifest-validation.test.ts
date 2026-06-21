import { describe, expect, it } from "vitest"

import { welcomeBannerManifest } from "../manifests"
import { widgetManifestSchema } from "../validators"

describe("widget manifest validation", () => {
  it("accepts a valid widget manifest", () => {
    const parsed = widgetManifestSchema.safeParse(welcomeBannerManifest)
    expect(parsed.success).toBe(true)
  })

  it("rejects an invalid widget manifest", () => {
    const parsed = widgetManifestSchema.safeParse({
      metadata: {
        widgetId: "",
      },
    })

    expect(parsed.success).toBe(false)
  })
})
