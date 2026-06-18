"use client"
import {ApexAreaChart} from "./ApexAreaChart"
import { ApexBarChart } from "./ApexBarChart"
import { ApexLineChart } from "./ApexLineChart"
import { ApexStackedBarChart } from "./ApexStackedBarChart"
import {ApexMixedChart} from "./ApexMixedChart"
import { ApexDonutChart } from "./ApexDonutChart"
import { ApexPieChart } from "./ApexPieChart"
import { ApexRadialChart } from "./ApexRadialChart"

export default function ApexChartsPage() {
  return (
    <div className="chart-container space-y-6">
      <div className="grid gap-6 grid-cols-1">
        <ApexAreaChart/>
        <ApexBarChart/>
        <ApexStackedBarChart/>
        <ApexLineChart/>
        <ApexMixedChart/>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
         <ApexDonutChart/>
         <ApexPieChart/>
         <ApexRadialChart/>
      </div>

    </div>
  )
}
