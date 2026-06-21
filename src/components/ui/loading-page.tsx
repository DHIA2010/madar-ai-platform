import { LoadingCard } from "@/components/ui/loading-card"
import { LoadingChart } from "@/components/ui/loading-chart"
import { LoadingTable } from "@/components/ui/loading-table"

export function LoadingPage({
  cards = 2,
  showChart = true,
  showTable = false,
}: {
  cards?: number
  showChart?: boolean
  showTable?: boolean
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 md:grid-cols-2">
        {Array.from({ length: cards }).map((_, index) => (
          <LoadingCard key={index} />
        ))}
      </div>
      {showChart ? <LoadingChart /> : null}
      {showTable ? <LoadingTable /> : null}
    </div>
  )
}
