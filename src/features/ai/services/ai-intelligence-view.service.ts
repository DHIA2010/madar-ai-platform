import type { AppStatusTone } from "@/components/app"

import type { AIInsightItemDto } from "../types"

import type { AIInsightTone } from "@/application/contracts"

const toneMap: Record<AIInsightTone, AppStatusTone> = {
  success: "success",
  info: "info",
  warning: "warning",
  error: "danger",
  neutral: "neutral",
}

export function mapInsightToneToStatusTone(tone: AIInsightTone): AppStatusTone {
  return toneMap[tone]
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: "SAR",
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatPercent(value: number) {
  return `${value.toFixed(1)}%`
}

const insightPriorityWeight: Record<AIInsightTone, number> = {
  error: 5,
  warning: 4,
  info: 3,
  success: 2,
  neutral: 1,
}

export function prioritizeInsights(insights: AIInsightItemDto[], limit = 3): AIInsightItemDto[] {
  return [...insights]
    .sort((left, right) => insightPriorityWeight[right.tone] - insightPriorityWeight[left.tone])
    .slice(0, limit)
}

export function severityLabelFromTone(tone: AIInsightTone): string {
  if (tone === "error") {
    return "Critical"
  }

  if (tone === "warning") {
    return "High"
  }

  if (tone === "info") {
    return "Medium"
  }

  return "Standard"
}
