"use client"

interface CampaignSpendDonutProps {
  distribution: Array<{ label: string; value: number; color: string }>
}

export function CampaignSpendDonut({ distribution }: CampaignSpendDonutProps) {
  const total = distribution.reduce((sum, item) => sum + item.value, 0)

  const chartGradient = distribution
    .reduce<{ from: number; to: number; color: string }[]>((acc, item) => {
      const start = acc.length === 0 ? 0 : acc[acc.length - 1].to
      const slice = total > 0 ? (item.value / total) * 100 : 0
      acc.push({ from: start, to: start + slice, color: item.color })
      return acc
    }, [])
    .map((segment) => `${segment.color} ${segment.from}% ${segment.to}%`)
    .join(", ")

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr] lg:items-center">
      <div className="mx-auto flex size-52 items-center justify-center rounded-full border border-border/70 bg-card">
        <div
          className="flex size-44 items-center justify-center rounded-full"
          style={{ background: `conic-gradient(${chartGradient || "hsl(var(--muted)) 0% 100%"})` }}
        >
          <div className="flex size-24 items-center justify-center rounded-full bg-background text-center text-xs font-medium text-muted-foreground">
            Total
            <br />
            Spend
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {distribution.map((item) => {
          const percent = total > 0 ? ((item.value / total) * 100).toFixed(1) : "0.0"
          return (
            <div
              key={item.label}
              className="flex items-center justify-between rounded-lg border border-border/60 bg-card px-3 py-2 text-sm"
            >
              <div className="flex items-center gap-2">
                <span className="size-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                <span>{item.label}</span>
              </div>
              <span className="font-medium text-foreground">{percent}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
