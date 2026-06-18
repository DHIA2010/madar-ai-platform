import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Area,
  Line,
  LineChart,
  ResponsiveContainer,
} from "recharts"

const sessionsData = [
  { value: 30 },
  { value: 45 },
  { value: 20 },
  { value: 60 },
  { value: 40 },
  { value: 70 },
  { value: 50 },
]

export default function TotalSessionsCard() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-md font-semibold text-muted-foreground">
          Total Sessions
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4 p-6">
        <div>
          <h2 className="text-3xl font-bold mb-2">4.5K</h2>
          <p className="text-md text-emerald-600">
            +8.2% from last week
          </p>
        </div>

        <div className="h-24">
  <ResponsiveContainer width="100%" height="100%">

    <LineChart data={sessionsData}>

      <defs>

        {/* Area Fill */}

        <linearGradient
          id="sessionsFill"
          x1="0"
          y1="0"
          x2="0"
          y2="1"
        >

          <stop
            offset="0%"
            stopColor="#FBBF24"
            stopOpacity={0.20}
          />

          <stop
            offset="100%"
            stopColor="#F59E0B"
            stopOpacity={0}
          />

        </linearGradient>


        {/* Line Gradient */}

        <linearGradient
          id="sessionsStroke"
          x1="0"
          y1="0"
          x2="1"
          y2="0"
        >

          <stop
            offset="0%"
            stopColor="#FBBF24"
          />

          <stop
            offset="100%"
            stopColor="#F59E0B"
          />

        </linearGradient>


        {/* Glow */}

        <filter id="sessionsGlow">

          <feGaussianBlur
            stdDeviation="2"
            result="blur"
          />

          <feMerge>

            <feMergeNode in="blur"/>

            <feMergeNode in="SourceGraphic"/>

          </feMerge>

        </filter>

      </defs>


      <Area
        type="natural"
        dataKey="value"
        stroke="none"
        fill="url(#sessionsFill)"
      />


      <Line
        type="natural"

        dataKey="value"

        stroke="url(#sessionsStroke)"

        strokeWidth={3}

        filter="url(#sessionsGlow)"

        dot={{
          r: 5,

          strokeWidth: 2,

          stroke: "#FBBF24",

          fill: "var(--card)",
        }}

        activeDot={{
          r: 7,

          strokeWidth: 3,

          stroke: "#FBBF24",

          fill: "var(--card)",
        }}
      />

    </LineChart>

  </ResponsiveContainer>
</div>
      </CardContent>
    </Card>
  )
}
