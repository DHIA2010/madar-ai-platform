"use client"
// app/components/WizardContext.tsx
import React, { createContext, useContext, useState } from "react"

const WizardContext = createContext<any>(null)

export function WizardProvider({ children }: any) {
  const [step, setStep] = useState(1)
  const next = () => setStep((s) => Math.min(s + 1, 4))
  const back = () => setStep((s) => Math.max(s - 1, 1))
  const goTo = (s: number) => setStep(s)
  
  return (
    <WizardContext.Provider value={{ step, next, back, goTo }}>
      {children}
    </WizardContext.Provider>
  )
}

export const useWizard = () => useContext(WizardContext)