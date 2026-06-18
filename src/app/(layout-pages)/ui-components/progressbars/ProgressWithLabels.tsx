"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"

const progressData = [
  { label: "Primary", value: 40, color: "bg-blue-500" },
  { label: "Success", value: 50, color: "bg-emerald-500" },
  { label: "Info", value: 60, color: "bg-cyan-500" },
  { label: "Warning", value: 70, color: "bg-amber-500" },
  { label: "Danger", value: 80, color: "bg-red-500" },
]

export function ProgressWithLabels() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">
          Progress with Labels
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        {progressData.map((item, index) => (
          <div key={index} className="space-y-2">
            
            {/* Label + Percentage */}
            <div className="flex items-center justify-between text-sm font-medium">
              <span>{item.label}</span>
              <span>{item.value}%</span>
            </div>

            {/* Progress */}
            <Progress
              value={item.value}
              className={`h-2 bg-muted [&>div]:${item.color}`}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
