import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  AreaChart,
  Area,
  ResponsiveContainer,
} from "recharts"

const areaData = [
  { value: 30 },
  { value: 45 },
  { value: 35 },
  { value: 65 },
  { value: 40 },
  { value: 80 },
  { value: 50 },
]

export default function AreaStatsCard() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-md font-semibold text-muted-foreground">
          Total Revenue
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4 p-6">
        <div>
          <h2 className="text-3xl font-bold mb-2">$18.4K</h2>
          <p className="text-md text-emerald-600">
            +7.8% from last week
          </p>
        </div>

        <div className="h-24">
  <ResponsiveContainer width="100%" height="100%">
    <AreaChart data={areaData}>

      <defs>

        {/* Fill */}

        <linearGradient
          id="revenueFill"
          x1="0"
          y1="0"
          x2="0"
          y2="1"
        >

          <stop
            offset="0%"
            stopColor="#A78BFA"
            stopOpacity={0.35}
          />

          <stop
            offset="50%"
            stopColor="#8B5CF6"
            stopOpacity={0.15}
          />

          <stop
            offset="100%"
            stopColor="#7C3AED"
            stopOpacity={0}
          />

        </linearGradient>


        {/* Stroke */}

        <linearGradient
          id="revenueStroke"
          x1="0"
          y1="0"
          x2="1"
          y2="0"
        >

          <stop
            offset="0%"
            stopColor="#A78BFA"
          />

          <stop
            offset="100%"
            stopColor="#7C3AED"
          />

        </linearGradient>


        {/* Glow */}

        <filter id="revenueGlow">

          <feGaussianBlur
            stdDeviation="3"
            result="blur"
          />

          <feMerge>

            <feMergeNode in="blur" />

            <feMergeNode in="SourceGraphic" />

          </feMerge>

        </filter>

      </defs>


      <Area
        type="natural"

        dataKey="value"

        stroke="url(#revenueStroke)"

        strokeWidth={3}

        fill="url(#revenueFill)"

        filter="url(#revenueGlow)"
      />

    </AreaChart>
  </ResponsiveContainer>
</div>
      </CardContent>
    </Card>
  )
}
