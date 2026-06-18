"use client"

import { User, Settings, CreditCard, Check } from "lucide-react"
import { cn } from "@/lib/utils"

const steps = [
  { id: 1, label: "Personal details", icon: User },
  { id: 2, label: "Additional Info", icon: Settings },
  { id: 3, label: "Payment Info", icon: CreditCard },
  { id: 4, label: "Last step", icon: Check },
]

export default function StepProgress({ currentStep }: { currentStep: number }) {
  return (
    <div className="w-full py-10">
      <div className="flex items-center justify-between relative">

        {/* Background Line */}
        <div className="absolute top-6 left-0 w-full h-[2px] bg-border rounded-full" />

        {/* Active Line */}
        <div
          className="absolute top-6 left-0 h-[6px] bg-primary rounded-full transition-all duration-500"
          style={{
            width: `${((currentStep - 1) / (steps.length - 1)) * 100}%`,
          }}
        />

        {steps.map((step) => {
          const Icon = step.icon
          const isCompleted = currentStep > step.id
          const isActive = currentStep === step.id

          return (
            <div
              key={step.id}
              className="relative z-10 flex flex-col items-center w-full"
            >
              {/* Circle */}
              <div
                className={cn(
                  "flex items-center justify-center w-12 h-12 rounded-full border transition-all duration-300",

                  // Completed
                  isCompleted &&
                    "bg-primary border-primary text-primary-foreground",

                  // Active
                  isActive &&
                    "bg-primary border-primary text-primary-foreground shadow-lg shadow-primary/30 scale-110",

                  // Inactive (Dark Friendly)
                  !isActive &&
                    !isCompleted &&
                    "bg-muted border-border text-muted-foreground"
                )}
              >
                {isCompleted ? (
                  <Check className="w-5 h-5" />
                ) : (
                  <Icon className="w-5 h-5" />
                )}
              </div>

              {/* Label */}
              <p
                className={cn(
                  "mt-4 text-sm transition-colors",
                  isActive || isCompleted
                    ? "text-foreground"
                    : "text-muted-foreground"
                )}
              >
                {step.label}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}