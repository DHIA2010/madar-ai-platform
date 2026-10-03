import type {
  AnalyticalEvidence,
  CampaignRecommendation,
  CampaignScalingSignal,
  ContributionRow,
  MetricDelta,
  PeriodComparisonResult,
  PerformanceDriver,
} from "./analytics-types"

// Thresholds that decide whether a change is worth recommending anything about at all -- below
// these, "no action" is the only honest recommendation. Kept separate from
// confidence-engine.ts's sample-size thresholds: this one is about the SIZE of the effect, that
// one is about how much DATA backs it.
const ROAS_DECLINE_REVIEW_THRESHOLD_PCT = -15
const ROAS_GROWTH_CONSIDERATION_THRESHOLD_PCT = 15

function toEvidence(
  delta: MetricDelta,
  period: PeriodComparisonResult["period"],
  source: string,
  confidence: AnalyticalEvidence["confidence"]
): AnalyticalEvidence {
  return {
    metric: delta.metric,
    currentValue: delta.current,
    previousValue: delta.previous,
    changePercent: delta.changePercent,
    period: {
      current: `${period.current.from} -> ${period.current.to}`,
      previous: `${period.previous.from} -> ${period.previous.to}`,
    },
    source,
    confidence,
  }
}

// Account-level recommendation from a period comparison + its drivers. Conservative by design
// (requirement: never "increase budget by X%", only qualitative, decision-support language) --
// and gated entirely on computed confidence/thresholds, never on the LLM's own judgment of
// whether the evidence is "enough."
export function generateAccountRecommendation(
  comparison: PeriodComparisonResult,
  drivers: PerformanceDriver[]
): CampaignRecommendation {
  const roasDelta = comparison.deltas.find((d) => d.metric === "roas")
  const source = "campaigns/analytics-engine.ts:comparePeriods"
  const evidence = comparison.deltas
    .filter((d) => d.changePercent !== null && Math.abs(d.changePercent) >= 10)
    .map((d) => toEvidence(d, comparison.period, source, comparison.confidence))

  if (comparison.confidence === "insufficient") {
    return {
      type: "no_action",
      priority: "low",
      entityType: "account",
      entityId: null,
      entityName: "الحساب الإعلاني",
      reason: "لا توجد بيانات كافية (إنفاق/نقرات/تحويلات/أيام) لمقارنة موثوقة بين الفترتين.",
      evidence,
      confidence: "insufficient",
      recommendedAction: "لا توجد بيانات كافية لإعطاء توصية موثوقة.",
    }
  }

  if (
    roasDelta?.changePercent !== null &&
    roasDelta &&
    roasDelta.changePercent <= ROAS_DECLINE_REVIEW_THRESHOLD_PCT
  ) {
    const topDriver = drivers[0]
    return {
      type: "budget_review",
      priority: Math.abs(roasDelta.changePercent) >= 30 ? "high" : "medium",
      entityType: "account",
      entityId: null,
      entityName: "الحساب الإعلاني",
      reason: topDriver
        ? `انخفض ROAS بنسبة ${Math.abs(roasDelta.changePercent)}%، وهذا يتوافق مع ${topDriver.narrative}`
        : `انخفض ROAS بنسبة ${Math.abs(roasDelta.changePercent)}% دون تغيّر مصاحب واضح في المقاييس الأخرى.`,
      evidence,
      confidence: comparison.confidence,
      recommendedAction: "يُنصح بمراجعة أداء الحملات قبل زيادة الميزانية الإجمالية.",
    }
  }

  if (
    roasDelta?.changePercent !== null &&
    roasDelta &&
    roasDelta.changePercent >= ROAS_GROWTH_CONSIDERATION_THRESHOLD_PCT
  ) {
    return {
      type: "budget_increase_consideration",
      priority: "medium",
      entityType: "account",
      entityId: null,
      entityName: "الحساب الإعلاني",
      reason: `تحسّن ROAS بنسبة ${roasDelta.changePercent}% مقارنة بالفترة السابقة.`,
      evidence,
      confidence: comparison.confidence,
      recommendedAction:
        "الأداء يُظهر كفاءة جيدة، ويمكن دراسة زيادة الميزانية تدريجيًا بعد التأكد من استقرار الأداء لفترة إضافية.",
    }
  }

  return {
    type: "no_action",
    priority: "low",
    entityType: "account",
    entityId: null,
    entityName: "الحساب الإعلاني",
    reason: "لم يتجاوز التغيّر في ROAS الحد الذي يستدعي إجراءً.",
    evidence,
    confidence: comparison.confidence,
    recommendedAction: "لا يوصى حاليًا بأي تغيير في الميزانية.",
  }
}

// Per-campaign recommendations from contribution analysis -- only for campaigns whose financial
// impact is material (top N by roasDeteriorationScore, already sorted by analytics-engine.ts),
// never a blanket "review every campaign that moved at all."
export function generateContributionRecommendations(
  rows: ContributionRow[],
  period: PeriodComparisonResult["period"],
  confidence: AnalyticalEvidence["confidence"]
): CampaignRecommendation[] {
  const source = "campaigns/analytics-engine.ts:getContributionAnalysis"
  return rows
    .filter((row) => (row.roasDeteriorationScore ?? 0) > 0)
    .map((row) => ({
      type: "investigate_inefficiency" as const,
      priority: row.spendShare > 0.2 ? ("high" as const) : ("medium" as const),
      entityType: "campaign" as const,
      entityId: row.entityId,
      entityName: row.entityName,
      reason: row.declineContributionPercent
        ? `ساهمت هذه الحملة بنحو ${row.declineContributionPercent}% من إجمالي تراجع كفاءة ROAS على مستوى الحساب، وتمثل ${Math.round(row.spendShare * 100)}% من إجمالي الإنفاق.`
        : `ساهمت هذه الحملة بأكبر قدر من تراجع كفاءة ROAS الإجمالية، وتمثل ${Math.round(row.spendShare * 100)}% من إجمالي الإنفاق.`,
      evidence: [
        {
          metric: "roasDeteriorationScore",
          currentValue: row.roasDeteriorationScore,
          previousValue: null,
          changePercent: null,
          period: { current: `${period.current.from} -> ${period.current.to}` },
          entity: { type: "campaign" as const, id: row.entityId, name: row.entityName },
          source,
          confidence,
        },
      ],
      confidence,
      recommendedAction: "يُنصح بمراجعة استهداف وكفاءة هذه الحملة قبل أي زيادة في ميزانيتها.",
    }))
}

// Translates a scaling signal (itself already a multi-factor computation over ROAS, CPA, AND
// conversion volume together -- see analytics-engine.ts's getCampaignScalingSignals) into
// conservative, decision-support language. Never promises future performance (requirement: "Do
// not promise future performance. Do not predict revenue") -- only ever "a test could be
// considered" / "review before any change," never a specific percentage or guaranteed outcome.
// insufficient_data and neutral signals never produce a recommendation at all -- silence is the
// honest answer when there's nothing material to say.
export function generateScalingRecommendations(
  signals: CampaignScalingSignal[],
  period: PeriodComparisonResult["period"]
): CampaignRecommendation[] {
  const source = "campaigns/analytics-engine.ts:getCampaignScalingSignals"
  const recommendations: CampaignRecommendation[] = []

  for (const signal of signals) {
    if (signal.signal === "insufficient_data" || signal.signal === "neutral") continue
    const evidence: AnalyticalEvidence[] = [
      {
        metric: "roasVsAccount",
        currentValue: signal.roasVsAccountPercent,
        previousValue: null,
        changePercent: null,
        period: { current: `${period.current.from} -> ${period.current.to}` },
        entity: { type: "campaign", id: signal.campaignId, name: signal.campaignName },
        source,
        confidence: signal.confidence,
      },
      {
        metric: "cpaVsAccount",
        currentValue: signal.cpaVsAccountPercent,
        previousValue: null,
        changePercent: null,
        period: { current: `${period.current.from} -> ${period.current.to}` },
        entity: { type: "campaign", id: signal.campaignId, name: signal.campaignName },
        source,
        confidence: signal.confidence,
      },
    ]

    if (signal.signal === "strong_positive" || signal.signal === "positive") {
      recommendations.push({
        type: "budget_increase_consideration",
        priority: signal.signal === "strong_positive" ? "medium" : "low",
        entityType: "campaign",
        entityId: signal.campaignId,
        entityName: signal.campaignName,
        reason: `كفاءة هذه الحملة (ROAS وCPA) أفضل من متوسط الحساب، بحجم تحويلات ${signal.conversionVolume}.`,
        evidence,
        confidence: signal.confidence,
        recommendedAction:
          "هذه الحملة تُظهر كفاءة جيدة مقارنة بباقي الحملات، ويمكن دراسة زيادة الميزانية تدريجيًا بعد التأكد من استقرار الأداء -- دون ضمان تكرار نفس النتيجة مستقبلًا.",
      })
    } else {
      recommendations.push({
        type: "investigate_inefficiency",
        priority: "medium",
        entityType: "campaign",
        entityId: signal.campaignId,
        entityName: signal.campaignName,
        reason: `كفاءة هذه الحملة (ROAS وCPA) أضعف من متوسط الحساب، بحجم تحويلات ${signal.conversionVolume}.`,
        evidence,
        confidence: signal.confidence,
        recommendedAction: "يُنصح بمراجعة هذه الحملة قبل زيادة ميزانيتها.",
      })
    }
  }

  return recommendations
}
