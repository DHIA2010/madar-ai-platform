"use client"

import { useWizard } from "./WizardContext"
import { Button } from "@/components/ui/button"
import StepProgress from "./StepProgress"

export default function FormWizard({ children }: any) {
  const { step, next, back } = useWizard()

  return (
    <div className="w-full mx-auto p-8 space-y-8">

      {/* Stepper */}
      <StepProgress currentStep={step} />

      {/* Render Step */}
      <div>{children[step - 1]}</div>

      {/* Controls */}
      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={back} disabled={step === 1}>
          Back
        </Button>
        <Button onClick={next}>
          {step === 4 ? "Finish" : "Next"}
        </Button>
      </div>

    </div>
  )
}