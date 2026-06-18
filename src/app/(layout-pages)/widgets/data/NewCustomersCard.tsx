import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  BarChart,
  Bar,
  ResponsiveContainer,
} from "recharts"

const customersData = [
  { value: 20 },
  { value: 45 },
  { value: 30 },
  { value: 60 },
  { value: 25 },
  { value: 75 },
  { value: 55 },
]

export default function NewCustomersCard() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-md font-semibold text-muted-foreground">
          New Customers
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4 p-6">
        <div>
          <h2 className="text-3xl font-bold mb-2">1.2K</h2>
          <p className="text-md text-emerald-500">
            +3.2% from last week
          </p>
        </div>

        <div className="h-24">
  <ResponsiveContainer width="100%" height="100%">
    <BarChart data={customersData}>

      <defs>

        <linearGradient
          id="customersGradient"
          x1="0"
          y1="0"
          x2="0"
          y2="1"
        >
          <stop offset="0%" stopColor="#67E8F9" />
          <stop offset="60%" stopColor="#38BDF8" />
          <stop offset="100%" stopColor="#0284C7" />
        </linearGradient>

        <filter id="customersGlow">
          <feGaussianBlur
            stdDeviation="2"
            result="blur"
          />

          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>

        </filter>

      </defs>

      <Bar
        dataKey="value"
        fill="url(#customersGradient)"
        radius={[8, 8, 0, 0]}
        filter="url(#customersGlow)"
      />

    </BarChart>
  </ResponsiveContainer>
</div>

      </CardContent>
    </Card>
  )
}
