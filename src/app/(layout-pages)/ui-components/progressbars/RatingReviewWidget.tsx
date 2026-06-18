"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Star } from "lucide-react"

const ratingData = [
  { star: 5, value: 80 },
  { star: 4, value: 60 },
  { star: 3, value: 40 },
  { star: 2, value: 20 },
  { star: 1, value: 10 },
]

export function RatingReviewWidget() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">
          Rating & Reviews
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">

        {/* Average Rating */}
        <div className="flex items-center gap-4">
          <div className="text-4xl font-bold">4.5</div>

          <div>
            <div className="flex items-center text-amber-500">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="h-4 w-4 fill-amber-500" />
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              Based on 2,548 reviews
            </p>
          </div>
        </div>

        {/* Rating Breakdown */}
        <div className="space-y-4">
          {ratingData.map((item) => (
            <div
              key={item.star}
              className="flex items-center gap-3"
            >
              {/* Star Label */}
              <div className="flex items-center gap-1 w-12 text-sm font-medium">
                {item.star}
                <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
              </div>

              {/* Progress */}
              <Progress
                value={item.value}
                className="h-2 flex-1 bg-muted [&>div]:bg-amber-500"
              />

              {/* Percentage */}
              <div className="w-10 text-right text-sm text-muted-foreground">
                {item.value}%
              </div>
            </div>
          ))}
        </div>

      </CardContent>
    </Card>
  )
}
