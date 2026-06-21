// app/components/steps/Step3.tsx
"use client"

import type { Dispatch, SetStateAction } from "react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type WizardForm = Record<string, string>

export default function Step3<T extends WizardForm>({
  form,
  setForm,
}: {
  form: T
  setForm: Dispatch<SetStateAction<T>>
}) {
  return (
    <div className="space-y-6 bg-background rounded-2xl shadow border p-8">
      {/* Title */}
      <div>
        <h2 className="text-lg font-semibold">Payment Information</h2>
        <p className="text-sm text-muted-foreground">
          Enter your card details to complete the payment.
        </p>
      </div>

      {/* Grid Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card Number */}
        <div className="space-y-2 md:col-span-2">
          <Label>Card Number</Label>
          <Input
            placeholder="1234 5678 9012 3456"
            value={form.cardNumber}
            onChange={(e) => setForm({ ...form, cardNumber: e.target.value })}
          />
        </div>

        {/* Card Holder Name */}
        <div className="space-y-2 md:col-span-2">
          <Label>Card Holder Name</Label>
          <Input
            placeholder="John Doe"
            value={form.cardHolder}
            onChange={(e) => setForm({ ...form, cardHolder: e.target.value })}
          />
        </div>

        {/* Expiry Date */}
        <div className="space-y-2">
          <Label>Expiry Date</Label>
          <Input
            placeholder="MM/YY"
            value={form.expiry}
            onChange={(e) => setForm({ ...form, expiry: e.target.value })}
          />
        </div>

        {/* CVV */}
        <div className="space-y-2">
          <Label>CVV</Label>
          <Input
            type="password"
            placeholder="123"
            value={form.cvv}
            onChange={(e) => setForm({ ...form, cvv: e.target.value })}
          />
        </div>
      </div>
    </div>
  )
}
