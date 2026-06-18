"use client"
import { useState } from "react"
import { Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group"

export default function PricingPage() {
  
  const [billing, setBilling] = useState("yearly")

  return (
    <div className="max-w-7xl mx-auto py-16 px-2">

      {/* Header */}
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold mb-3">
            Upgrade for More
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Upgrade to link your custom domain, track visits, edit content & unlock premium features.
          </p>

          {/* Billing Toggle */}
          <div className="mt-6 flex justify-center">
            <ToggleGroup
              type="single"
              defaultValue="yearly"
              onValueChange={(value) => value && setBilling(value)}
              className="border rounded-lg p-1"
            >
              <ToggleGroupItem value="monthly">
                Monthly
              </ToggleGroupItem>
              <ToggleGroupItem value="yearly">
                Yearly
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>

      {/* Pricing Grid */}
      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-8">

        {/* Free */}
        <Card className="rounded-xl border bg-background p-6">
          <CardContent className="p-0">

            <h3 className="text-lg font-semibold mb-4">Free</h3>

            <div className="text-4xl font-bold">
              $0 <span className="text-sm text-muted-foreground">/mo</span>
            </div>

            <p className="text-muted-foreground mt-3 mb-6">
              Try us out for a quick project or two
            </p>

            <Button variant="secondary" className="w-full mb-6">
              Get Started
            </Button>

            <ul className="space-y-3 text-sm">
              <li className="flex gap-2"><Check className="w-4 h-4 text-green-500"/>1 active project</li>
              <li className="flex gap-2"><Check className="w-4 h-4 text-green-500"/>3 MB upload limit</li>
              <li className="flex gap-2"><Check className="w-4 h-4 text-green-500"/>5,000 visitors /mo</li>
            </ul>

          </CardContent>
        </Card>

        {/* Tiny */}
        <Card className="rounded-xl border shadow-sm p-6">
          <CardContent className="p-0">

            <h3 className="text-lg font-semibold mb-4">Tiny</h3>

            <div className="text-4xl font-bold">
              $5 <span className="text-sm text-muted-foreground">/mo</span>
            </div>

            <p className="text-muted-foreground mt-3 mb-6">
              Perfect for a professional link
            </p>

            <Button className="w-full mb-6">
              Get Started
            </Button>

            <ul className="space-y-3 text-sm">
              <li className="flex gap-2"><Check className="w-4 h-4 text-green-500"/>1 active project</li>
              <li className="flex gap-2"><Check className="w-4 h-4 text-green-500"/>25 MB upload limit</li>
              <li className="flex gap-2"><Check className="w-4 h-4 text-green-500"/>10,000 visitors /mo</li>
              <li className="flex gap-2"><Check className="w-4 h-4 text-green-500"/>QR Codes</li>
              <li className="flex gap-2"><Check className="w-4 h-4 text-green-500"/>Built-in analytics</li>
            </ul>

          </CardContent>
        </Card>

        {/* Solo */}
        <Card className="relative rounded-xl border-2 border-purple-500 p-6 shadow-lg overflow-visible">
          
          {/* Badge */}
          <div className="absolute -top-4 left-1/2 -translate-x-1/2">
            <span className="bg-black text-white text-xs font-medium px-3 py-1 rounded-full">
              Most Popular
            </span>
          </div>

          <CardContent className="p-0">

            <h3 className="text-lg font-semibold mb-4">Solo</h3>

            <div className="text-4xl font-bold text-purple-600">
              $13 <span className="text-sm text-muted-foreground">/mo</span>
            </div>

            <p className="text-muted-foreground mt-3 mb-6">
              Great for individuals & small projects
            </p>

            <Button variant="outline" className="w-full mb-6">
              Get Started
            </Button>

            <ul className="space-y-3 text-sm">
              <li className="flex gap-2"><Check className="w-4 h-4 text-green-500"/>5 active projects</li>
              <li className="flex gap-2"><Check className="w-4 h-4 text-green-500"/>75 MB upload limit</li>
              <li className="flex gap-2"><Check className="w-4 h-4 text-green-500"/>100,000 visitors /mo</li>
              <li className="flex gap-2"><Check className="w-4 h-4 text-green-500"/>Custom domains</li>
              <li className="flex gap-2"><Check className="w-4 h-4 text-green-500"/>Password protection</li>
            </ul>

          </CardContent>
        </Card>

        {/* Pro */}
        <Card className="rounded-xl border p-6">
          <CardContent className="p-0">

            <h3 className="text-lg font-semibold mb-4">Pro</h3>

            <div className="text-4xl font-bold text-yellow-500">
              $31 <span className="text-sm text-muted-foreground">/mo</span>
            </div>

            <p className="text-muted-foreground mt-3 mb-6">
              For freelancers & agencies
            </p>

            <Button className="w-full mb-6">
              Get Started
            </Button>

            <ul className="space-y-3 text-sm">
              <li className="flex gap-2"><Check className="w-4 h-4 text-green-500"/>Unlimited projects</li>
              <li className="flex gap-2"><Check className="w-4 h-4 text-green-500"/>10 GB upload</li>
              <li className="flex gap-2"><Check className="w-4 h-4 text-green-500"/>500,000 visitors /mo</li>
              <li className="flex gap-2"><Check className="w-4 h-4 text-green-500"/>Capture emails</li>
              <li className="flex gap-2"><Check className="w-4 h-4 text-green-500"/>Team members</li>
            </ul>

          </CardContent>
        </Card>

      </div>
    </div>
  )
}