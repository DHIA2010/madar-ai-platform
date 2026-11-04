// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest"

import {
  ATTRIBUTION_PARAM,
  captureAttribution,
  encodeAttribution,
  readAttribution,
} from "./attribution"

function visit(path: string, referrer = "") {
  window.history.replaceState(null, "", path)
  Object.defineProperty(document, "referrer", { value: referrer, configurable: true })
  captureAttribution()
}

describe("attribution", () => {
  beforeEach(() => window.localStorage.clear())

  it("keeps the ad that first brought a visitor, and updates the latest visit", () => {
    visit("/?utm_source=snapchat&utm_medium=paid_social&utm_campaign=Ramadan&ScCid=abc")
    visit("/pricing")
    visit("/blog?utm_source=google&utm_campaign=Brand")
    const saved = readAttribution()!
    expect(saved.first).toMatchObject({
      source: "snapchat",
      campaign: "Ramadan",
      clickId: "abc",
      clickIdType: "snapchat",
      landingPage: "/",
    })
    expect(saved.last).toMatchObject({ source: "google", campaign: "Brand" })
  })

  it("names the platform from a click id alone, and records outside referrers", () => {
    visit("/?gclid=g1")
    expect(readAttribution()!.first).toMatchObject({ source: "google", clickId: "g1" })
    window.localStorage.clear()
    visit("/", "https://www.instagram.com/some/post")
    expect(readAttribution()!.first).toMatchObject({ source: null, referrer: "www.instagram.com" })
  })

  it("carries the saved touches to the app host in the _ma parameter", () => {
    visit("/?utm_source=snapchat&utm_campaign=Ramadan")
    const handed = encodeAttribution(readAttribution()!)
    window.localStorage.clear()
    visit(`/auth/basic/register?${ATTRIBUTION_PARAM}=${handed}`)
    expect(readAttribution()!.first).toMatchObject({ source: "snapchat", campaign: "Ramadan" })
  })
})
