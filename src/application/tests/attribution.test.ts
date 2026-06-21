import { describe, expect, it } from "vitest"

import { createAttributionRepository, DataAttributionRepository } from "@/infrastructure"

import { AttributionApplicationService } from "../services"

function sumCredits(credits: Array<{ credit: number }>) {
  return credits.reduce((sum, item) => sum + item.credit, 0)
}

describe("marketing attribution engine", () => {
  it("supports first, last, linear, time decay, and position based models", async () => {
    const repository = new DataAttributionRepository()

    const firstTouch = await repository.calculateAttribution({
      journeyId: "journey_001",
      conversionId: "conv_001",
      model: "first_touch",
    })
    expect(firstTouch.credits[0]?.credit).toBe(1)
    expect(firstTouch.credits.slice(1).every((item) => item.credit === 0)).toBe(true)

    const lastTouch = await repository.calculateAttribution({
      journeyId: "journey_001",
      conversionId: "conv_001",
      model: "last_touch",
    })
    const lastIndex = lastTouch.credits.length - 1
    expect(lastTouch.credits[lastIndex]?.credit).toBe(1)
    expect(lastTouch.credits.slice(0, lastIndex).every((item) => item.credit === 0)).toBe(true)

    const linear = await repository.calculateAttribution({
      journeyId: "journey_001",
      conversionId: "conv_001",
      model: "linear",
    })
    expect(linear.credits).toHaveLength(4)
    expect(linear.credits.every((item) => Math.abs(item.credit - 0.25) < 1e-9)).toBe(true)

    const timeDecay = await repository.calculateAttribution({
      journeyId: "journey_001",
      conversionId: "conv_001",
      model: "time_decay",
    })
    expect(sumCredits(timeDecay.credits)).toBeCloseTo(1, 10)
    expect(timeDecay.credits[3]?.credit).toBeGreaterThan(timeDecay.credits[2]?.credit ?? 0)
    expect(timeDecay.credits[2]?.credit).toBeGreaterThan(timeDecay.credits[1]?.credit ?? 0)
    expect(timeDecay.credits[1]?.credit).toBeGreaterThan(timeDecay.credits[0]?.credit ?? 0)

    const positionBased = await repository.calculateAttribution({
      journeyId: "journey_001",
      conversionId: "conv_001",
      model: "position_based",
    })
    expect(positionBased.credits.map((item) => item.credit)).toEqual([0.4, 0.1, 0.1, 0.4])
  })

  it("supports data-driven and custom model weighting", async () => {
    const repository = new DataAttributionRepository()

    const dataDriven = await repository.calculateAttribution({
      journeyId: "journey_001",
      conversionId: "conv_001",
      model: "data_driven",
    })
    const dataDrivenTop = dataDriven.credits.slice().sort((a, b) => b.credit - a.credit)[0]
    expect(dataDrivenTop?.channelId).toBe("channel_search")

    const custom = await repository.calculateAttribution({
      journeyId: "journey_001",
      conversionId: "conv_001",
      model: "custom",
      customWeights: {
        tp_003: 8,
        tp_001: 1,
        tp_002: 1,
        tp_004: 1,
      },
    })

    const customTop = custom.credits.slice().sort((a, b) => b.credit - a.credit)[0]
    expect(customTop?.touchpointId).toBe("tp_003")
    expect(sumCredits(custom.credits)).toBeCloseTo(1, 10)
    expect(custom.credits.reduce((sum, item) => sum + item.attributedRevenue, 0)).toBeCloseTo(
      1000,
      10
    )
  })

  it("returns conversion model comparisons and performance read models", async () => {
    const service = new AttributionApplicationService(createAttributionRepository())

    const conversion = await service.getConversionAttribution("journey_001", "conv_001")
    expect(conversion.payload).toHaveLength(6)
    expect(conversion.id).toBe("conversion-attribution:journey_001:conv_001")

    const comparison = await service.compareAttributionModels({
      journeyId: "journey_001",
      conversionId: "conv_001",
      models: [
        "first_touch",
        "last_touch",
        "linear",
        "time_decay",
        "position_based",
        "data_driven",
      ],
    })
    expect(comparison.payload.models).toHaveLength(6)
    expect(comparison.payload.models.every((entry) => entry.topChannelId)).toBe(true)

    const channelPerformance = await service.getChannelPerformance()
    expect(channelPerformance.payload.length).toBeGreaterThan(0)
    expect(channelPerformance.payload.every((entry) => entry.roas >= 0)).toBe(true)

    const campaignPerformance = await service.getCampaignPerformance()
    expect(campaignPerformance.payload.length).toBeGreaterThan(0)
    expect(campaignPerformance.id).toBe("campaign-performance:all")
  })

  it("calculates campaign ROI/ROAS and supports preview attribution", async () => {
    const service = new AttributionApplicationService(createAttributionRepository())

    const roi = await service.getCampaignROI("cmp_retargeting")
    expect(roi?.payload.revenue).toBeCloseTo(600, 10)
    expect(roi?.payload.spend).toBe(200)
    expect(roi?.payload.roi).toBeCloseTo(2, 10)

    const roas = await service.getCampaignROAS("cmp_retargeting")
    expect(roas?.payload.roas).toBeCloseTo(3, 10)

    const zeroSpend = await service.getCampaignROAS("cmp_direct")
    expect(zeroSpend?.payload.spend).toBe(0)
    expect(zeroSpend?.payload.roas).toBe(0)

    const preview = await service.previewAttribution({
      journeyId: "journey_001",
      conversionRevenue: 450,
      model: "custom",
      customWeights: {
        channel_email: 10,
      },
    })

    expect(preview.payload.totalRevenue).toBe(450)
    expect(preview.payload.model).toBe("custom")
    expect(
      preview.payload.credits.reduce((sum, item) => sum + item.attributedRevenue, 0)
    ).toBeCloseTo(450, 10)
  })
})
