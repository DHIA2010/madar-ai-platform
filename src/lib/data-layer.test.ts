// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest"

import { pushDataLayerEvent } from "./data-layer"

type TestWindow = Window & { dataLayer?: unknown[]; ttq?: { track: (event: string) => void } }
const page = window as TestWindow

afterEach(() => {
  delete page.dataLayer
  delete page.ttq
})

describe("pushDataLayerEvent", () => {
  it("reports a lead to TikTok's pixel under its standard name, with no details", () => {
    const track = vi.fn()
    page.ttq = { track }

    pushDataLayerEvent("generate_lead", { form_name: "contact_sales", lead_id: "l-1" })

    expect(page.dataLayer).toEqual([
      { event: "generate_lead", form_name: "contact_sales", lead_id: "l-1" },
    ])
    expect(track).toHaveBeenCalledTimes(1)
    expect(track).toHaveBeenCalledWith("SubmitForm")
  })

  it("leaves other events to Tag Manager alone, and works without the pixel", () => {
    const track = vi.fn()
    page.ttq = { track }
    pushDataLayerEvent("request_call")
    expect(track).not.toHaveBeenCalled()

    delete page.ttq
    expect(() => pushDataLayerEvent("sign_up")).not.toThrow()
    expect(page.dataLayer).toHaveLength(2)
  })

  it("never lets a failing pixel break the form", () => {
    page.ttq = {
      track: () => {
        throw new Error("blocked")
      },
    }
    expect(() => pushDataLayerEvent("generate_lead")).not.toThrow()
  })
})
