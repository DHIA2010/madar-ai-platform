import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  LineChart,
  Line,
  Area,
  ResponsiveContainer,
} from "recharts"

const visitorsData = [
  { value: 20 },
  { value: 35 },
  { value: 25 },
  { value: 60 },
  { value: 15 },
  { value: 75 },
  { value: 30 },
]

export default function WebsiteVisitorsCard() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-md font-semibold text-muted-foreground">
          Website Visitors
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4 p-6">
        <div>
          <h2 className="text-3xl font-bold mb-2">43K</h2>
          <p className="text-md text-emerald-500">
            +5.6% from last week
          </p>
        </div>

        <div className="h-24">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={visitorsData}>

  <defs>

    <linearGradient
      id="visitorsFill"
      x1="0"
      y1="0"
      x2="0"
      y2="1"
    >

      <stop
        offset="0%"
        stopColor="#818CF8"
        stopOpacity={0.35}
      />

      <stop
        offset="100%"
        stopColor="#6366F1"
        stopOpacity={0}
      />

    </linearGradient>


    <linearGradient
      id="visitorsStroke"
      x1="0"
      y1="0"
      x2="1"
      y2="0"
    >

      <stop
        offset="0%"
        stopColor="#818CF8"
      />

      <stop
        offset="100%"
        stopColor="#6366F1"
      />

    </linearGradient>


    <filter id="visitorsGlow">

      <feGaussianBlur
        stdDeviation="3"
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
    fill="url(#visitorsFill)"
    stroke="none"
  />

  <Line
    type="natural"
    dataKey="value"

    stroke="url(#visitorsStroke)"

    strokeWidth={3}

    filter="url(#visitorsGlow)"

    dot={false}
  />

</LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
