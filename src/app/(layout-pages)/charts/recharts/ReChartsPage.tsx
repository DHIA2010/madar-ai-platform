
import AreaChartPage from "./AreaChartPage"
import BarChartPage from "./BarChartPage"
import LineChartPage from "./LineChartPage"
import PieChartPage from "./PieChartPage"
import DonutChartPage from "./DonutChartPage"
import RadarChartPage from "./RadarChartPage"
import RadialChartPage from "./RadialChartPage"
import ChartRadialText from "./ChartRadialText"
import ChartPieDonutActive from "./ChartPieDonutActive"

export default function ReChartsPage() {
  return (
    <div className="chart-container space-y-6">
      <div className="grid gap-6 grid-cols-1">
        <AreaChartPage />
        <BarChartPage />
        <LineChartPage />
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <PieChartPage />
        <DonutChartPage />
        <RadarChartPage />
        <RadialChartPage />
        <ChartRadialText />
        <ChartPieDonutActive />
      </div>

    </div>
  )
}
