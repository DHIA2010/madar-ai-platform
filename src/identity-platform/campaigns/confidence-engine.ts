import type { ConfidenceLevel, SampleSize } from "./analytics-types"

// Transparent, hand-set thresholds -- not a statistical-significance test (we don't have the
// conversion-rate variance data to run one honestly), but a floor below which any comparison or
// recommendation is more noise than signal. Named and exported so they can be tuned without
// touching the computation logic, per the "make thresholds configurable" requirement.
export const CONFIDENCE_THRESHOLDS = {
  high: { minSpend: 1000, minClicks: 200, minConversions: 10, minDays: 7 },
  medium: { minSpend: 200, minClicks: 50, minConversions: 3, minDays: 3 },
  // Below "low" is "insufficient" -- the engine must say so explicitly rather than guess.
  low: { minSpend: 20, minClicks: 10, minConversions: 1, minDays: 1 },
} as const

// A comparison additionally needs a minimum number of days on BOTH sides to be considered at all
// -- a 1-day "period" either side is too short-lived to call a trend, regardless of spend/clicks.
function meetsBand(
  sampleSize: SampleSize,
  band: (typeof CONFIDENCE_THRESHOLDS)[keyof typeof CONFIDENCE_THRESHOLDS]
): boolean {
  return (
    sampleSize.spend >= band.minSpend &&
    sampleSize.clicks >= band.minClicks &&
    sampleSize.conversions >= band.minConversions &&
    sampleSize.days >= band.minDays
  )
}

// Pure, deterministic -- the backend decides confidence, never the LLM (requirement: "Do NOT ask
// the LLM to randomly choose confidence"). The LLM only ever narrates whichever label this
// function already returned.
export function computeConfidence(sampleSize: SampleSize): ConfidenceLevel {
  if (meetsBand(sampleSize, CONFIDENCE_THRESHOLDS.high)) return "high"
  if (meetsBand(sampleSize, CONFIDENCE_THRESHOLDS.medium)) return "medium"
  if (meetsBand(sampleSize, CONFIDENCE_THRESHOLDS.low)) return "low"
  return "insufficient"
}

// A comparison's overall confidence is never higher than the weaker of its two sides -- a
// strong current period compared against a thin previous period (e.g. a brand-new campaign) is
// only as trustworthy as the thinner side.
export function combineConfidence(a: ConfidenceLevel, b: ConfidenceLevel): ConfidenceLevel {
  const order: ConfidenceLevel[] = ["insufficient", "low", "medium", "high"]
  return order[Math.min(order.indexOf(a), order.indexOf(b))]
}

// Pure addition alongside computeConfidence -- never changes its signature or any existing
// caller, since that function is used throughout analytics-engine.ts/recommendation-engine.ts and
// changing its return shape would ripple through all of them for no benefit. This is for callers
// that specifically want the human-readable "why" (the response-formatter's data-quality layer),
// not every caller that just needs the bare level to gate a decision.
export function explainConfidence(sampleSize: SampleSize, level: ConfidenceLevel): string[] {
  if (level === "high") {
    return ["تتوفر بيانات كافية (الإنفاق والنقرات والتحويلات ومدة الفترة) لإعطاء نتيجة موثوقة."]
  }
  const reasons: string[] = []
  const band = level === "medium" ? CONFIDENCE_THRESHOLDS.high : CONFIDENCE_THRESHOLDS.medium
  if (sampleSize.spend < band.minSpend) {
    reasons.push(`الإنفاق خلال الفترة (${sampleSize.spend}) أقل من الحد المطلوب لثقة أعلى.`)
  }
  if (sampleSize.clicks < band.minClicks) {
    reasons.push(`عدد النقرات (${sampleSize.clicks}) أقل من الحد المطلوب لثقة أعلى.`)
  }
  if (sampleSize.conversions < band.minConversions) {
    reasons.push(`عدد التحويلات (${sampleSize.conversions}) أقل من الحد المطلوب لثقة أعلى.`)
  }
  if (sampleSize.days < band.minDays) {
    reasons.push(`مدة الفترة (${sampleSize.days} يوم) أقصر من الحد المطلوب لثقة أعلى.`)
  }
  return reasons.length > 0 ? reasons : ["البيانات المتاحة محدودة مقارنة بالحجم المعتاد."]
}
