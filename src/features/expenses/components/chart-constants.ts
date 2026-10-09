// Duplicated from src/features/reports/components/kpi-widget-renderer.tsx's own constants --
// same convention every feature follows (page-local copies, not cross-feature imports).
export const CHART_COLORS = [
  "#2878ff",
  "#22c55e",
  "#f59e0b",
  "#a855f7",
  "#ef4444",
  "#06b6d4",
  "#eab308",
  "#64748b",
]

export const AXIS_TICK_STYLE = { fontSize: 10.5, fill: "#0b1738" }

export const TOOLTIP_STYLE = {
  borderRadius: 10,
  border: "1px solid #e1e7f0",
  fontSize: 12,
  boxShadow: "0 8px 24px rgba(11,23,56,0.08)",
}

export function formatCurrencyCompact(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(value))
}
