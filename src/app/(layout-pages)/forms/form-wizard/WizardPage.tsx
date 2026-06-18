"use client"

import { useState } from "react"
import { WizardProvider } from "./WizardContext"
import FormWizard from "./FormWizard"
import Step1 from "./steps/Step1"
import Step2 from "./steps/Step2"
import Step3 from "./steps/Step3"
import Step4 from "./steps/Step4"

export default function WizardPage() {
 const [form, setForm] = useState({
  // Step 1
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  country: "",
  language: "",

  // Step 2
  address: "",
  city: "",
  state: "",
  zip: "",
  occupation: "",
  company: "",

  // Step 3
  cardNumber: "",
  cardHolder: "",
  expiry: "",
  cvv: "",

  // Step 4
  comments: "",
})

  return (
    <WizardProvider>
      <FormWizard>
        <Step1 form={form} setForm={setForm} />
        <Step2 form={form} setForm={setForm} />
        <Step3 form={form} setForm={setForm} />
        <Step4 form={form} />
      </FormWizard>
    </WizardProvider>
  )
}