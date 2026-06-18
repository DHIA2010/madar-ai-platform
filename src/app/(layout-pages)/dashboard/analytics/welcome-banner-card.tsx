"use client"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

export default function WelcomeBannerCard() {
  return (
    <Card className="h-full relative overflow-hidden text-dark">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 md:p-8">
        
        {/* Left Content */}
        <div className="space-y-4">
            <h2 className="text-xl md:text-2xl font-semibold">
                Growth Insights
            </h2>
            <p className="text-sm md:text-base text-muted-foreground">
                Your key metrics show consistent growth across channels.
                <br />
                Dive deeper to identify top-performing segments.
            </p>
          <Button
            size="lg"
            className="bg-gradient-to-r from-pink-500 to-purple-600 text-white border-0 hover:opacity-90"
          >
            View insights
          </Button>
        </div>
        {/* Right Illustration */}
        <div className="hidden lg:flex items-center justify-end">
          <img
            src="https://codervent.com/pulse-ui/illustrations/graphic-designer-workplace-1.png"
            alt="Analytics illustration"
            className="max-h-32 md:max-h-48 lg:max-h-48"
          />
        </div>
      </div>

      {/* Decorative shapes */}
      <div className="pointer-events-none absolute -top-10 -right-10 h-40 w-40 rounded-full bg-white/10" />
      <div className="pointer-events-none absolute top-10 right-20 h-24 w-24 rounded-full bg-white/10" />
    </Card>
  )
}
