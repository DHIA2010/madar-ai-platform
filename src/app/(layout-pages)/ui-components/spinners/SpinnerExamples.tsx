"use client"

import { Card, CardContent } from "@/components/ui/card"

export default function SpinnerExamples() {
  return (
    <div className="space-y-6">
      
      <h5 className="text-lg font-semibold">Spinner Examples</h5>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

        {/* Reusable Card Classes */}
        {[
          // We just repeat card structure manually below
        ]}

        {/* 1. Simple Spinner */}
        <Card>
          <CardContent className="flex items-center justify-center h-32">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </CardContent>
        </Card>

        {/* 2. Bouncing Dots */}
        <Card>
          <CardContent className="flex items-center justify-center h-32 gap-2">
            <div className="h-3 w-3 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]" />
            <div className="h-3 w-3 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]" />
            <div className="h-3 w-3 bg-primary rounded-full animate-bounce" />
          </CardContent>
        </Card>

        {/* 3. Pulse Loader */}
        <Card>
          <CardContent className="flex items-center justify-center h-32">
            <div className="h-10 w-10 rounded-full bg-primary animate-ping" />
          </CardContent>
        </Card>

        {/* 4. Bars Loader */}
        <Card>
          <CardContent className="flex items-center justify-center h-32 gap-1">
            <div className="w-1 h-6 bg-primary animate-pulse" />
            <div className="w-1 h-8 bg-primary animate-pulse delay-100" />
            <div className="w-1 h-4 bg-primary animate-pulse delay-200" />
            <div className="w-1 h-7 bg-primary animate-pulse delay-300" />
          </CardContent>
        </Card>

        {/* 5. Ring Spinner */}
        <Card>
          <CardContent className="flex items-center justify-center h-32">
            <div className="h-10 w-10 rounded-full border-4 border-primary border-dashed animate-spin" />
          </CardContent>
        </Card>

        {/* 6. Dual Ring */}
        <Card>
          <CardContent className="flex items-center justify-center h-32 relative">
            <div className="absolute h-12 w-12 border-4 border-primary/40 rounded-full animate-spin" />
            <div className="h-8 w-8 border-4 border-primary rounded-full animate-spin" />
          </CardContent>
        </Card>

        {/* 7. Scale Bars */}
        <Card>
          <CardContent className="flex items-center justify-center h-32 gap-1">
            <div className="w-1 h-4 bg-primary animate-pulse" />
            <div className="w-1 h-6 bg-primary animate-pulse delay-150" />
            <div className="w-1 h-8 bg-primary animate-pulse delay-300" />
          </CardContent>
        </Card>

        {/* 8. Dot Spinner */}
        <Card>
          <CardContent className="flex items-center justify-center h-32">
            <div className="relative h-10 w-10">
              <div className="absolute h-3 w-3 bg-primary rounded-full top-0 left-1/2 -translate-x-1/2 animate-spin" />
              <div className="absolute h-3 w-3 bg-primary rounded-full bottom-0 left-1/2 -translate-x-1/2 animate-spin" />
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  )
}
