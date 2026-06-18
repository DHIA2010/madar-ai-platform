import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  RadialBarChart,
  RadialBar,
  ResponsiveContainer,
  PolarGrid,
} from "recharts"
import { ArrowUpRight } from "lucide-react"

interface RadialStatCardProps {
  title: string
  subtitle?: string
  value: number
  label: string
  trend?: string
  color?: string
}

export default function RadialStatCard({
  title,
  subtitle = "January – June 2024",
  value,
  label,
  trend = "Trending up",
  color = "#3b82f6",
}: RadialStatCardProps) {
  const data = [{ value }]

  return (
    <Card className="rounded-xl">
      <CardHeader className="space-y-0">
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </CardHeader>

      <CardContent className="flex flex-col items-center gap-6 p-6">
        {/* Chart */}
        <div className="relative h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <RadialBarChart
              data={data}
              startAngle={0}
              endAngle={250}
              innerRadius={80}
              outerRadius={110}
              >
              <PolarGrid 
              gridType="circle"
              radialLines={false}
              stroke="none"
              className="first:fill-muted last:fill-background"
              polarRadius={[86, 74]}
            />
              {/* Background track */}
              <RadialBar
                dataKey="value"
                //maxAngle={260}
               // clockWise
                cornerRadius={999}
                fill={color}
               // background={{ fill: "#0e87ff" }}
              />
            </RadialBarChart>
          </ResponsiveContainer>

          {/* Center text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold">{value}</span>
            <span className="text-sm text-muted-foreground">{label}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center space-y-1">
          <div className="flex items-center justify-center gap-1 text-sm font-medium">
            {trend}
            <ArrowUpRight className="h-4 w-4" />
          </div>
          <p className="text-xs text-muted-foreground">
            Showing total visitors for the last 6 months
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
