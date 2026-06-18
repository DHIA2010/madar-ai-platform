"use client"

import { useState } from "react"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"

export default function DesignerType() {
  const [selected, setSelected] = useState("visionary")

  const options = [
    { value: "visionary", label: "Visionary" },
    { value: "creativista", label: "Creativista" },
    { value: "stylizer", label: "Stylizer" },
    { value: "trendsetter", label: "Trendsetter" },
  ]

  return (
    <div className="p-6 rounded-2xl border bg-card mt-6">
      
      <h6 className="font-semibold mb-1">
        * What kind of designer are you?
      </h6>

      <p className="text-sm text-muted-foreground mb-4">
        Choose one for now. You can change this or add more types later.
      </p>

      <RadioGroup
        value={selected}
        onValueChange={setSelected}
        className="flex flex-wrap gap-3"
      >
        {options.map((opt) => {
          const isActive = selected === opt.value

          return (
            <Label
              key={opt.value}
              htmlFor={opt.value}
              className="cursor-pointer"
            >
              <div
                className={`flex items-center gap-2 px-4 py-2 rounded-full border transition-all duration-200
                ${isActive
                  ? "bg-primary text-primary-foreground border-primary"
                  : "hover:border-muted-foreground/40"
                }`}
              >
                <RadioGroupItem
                  value={opt.value}
                  id={opt.value}
                  className="h-4 w-4"
                />
                <span className="text-sm font-medium">
                  {opt.label}
                </span>
              </div>
            </Label>
          )
        })}
      </RadioGroup>

    </div>
  )
}