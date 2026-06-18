"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"

export default function DeliveryCards() {
  const [selected, setSelected] = useState("express")

  const options = [
    {
      value: "standard",
      title: "Standard",
      description: "4–10 business days",
      price: "$5.00",
    },
    {
      value: "express",
      title: "Express",
      description: "2–5 business days",
      price: "$16.00",
    },
    {
      value: "superfast",
      title: "Super Fast",
      description: "1 business day",
      price: "$25.00",
    },
  ]

  return (
    <RadioGroup
      value={selected}
      onValueChange={setSelected}
      className="grid grid-cols-1 md:grid-cols-3 gap-6"
    >
      {options.map((option) => {
        const isActive = selected === option.value

        return (
          <Label key={option.value} htmlFor={option.value} className="cursor-pointer">
            <Card
              className={`transition-all duration-200 border rounded-xl 
              ${isActive 
                ? "border-primary ring-2 ring-primary/20 bg-primary/5" 
                : "hover:border-muted-foreground/30"
              }`}
            >
              <CardContent className="p-5 flex items-start gap-3">
                
                <RadioGroupItem
                  value={option.value}
                  id={option.value}
                  className="mt-1"
                />

                <div>
                  <h6 className="font-semibold">{option.title}</h6>
                  <p className="text-sm text-muted-foreground">
                    {option.description}
                  </p>
                  <div className="font-bold mt-1">
                    {option.price}
                  </div>
                </div>

              </CardContent>
            </Card>
          </Label>
        )
      })}
    </RadioGroup>
  )
}