// app/components/steps/Step4.tsx
"use client"

import { useState } from "react"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"

export default function Step4({ form, setForm }: any) {
  const [agree, setAgree] = useState(false)

  return (
    <div className="space-y-8 bg-background rounded-2xl shadow border p-8">

      {/* Title */}
      <div>
        <h2 className="text-lg font-semibold">
          Review & Confirm
        </h2>
        <p className="text-sm text-muted-foreground">
          Please review your details before submitting.
        </p>
      </div>

      {/* Summary Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">

        <div><span className="font-medium">First Name:</span> {form.firstName}</div>
        <div><span className="font-medium">Last Name:</span> {form.lastName}</div>
        <div><span className="font-medium">Email:</span> {form.email}</div>
        <div><span className="font-medium">Phone:</span> {form.phone}</div>
        <div><span className="font-medium">Address:</span> {form.address}</div>
        <div><span className="font-medium">City:</span> {form.city}</div>
        <div><span className="font-medium">State:</span> {form.state}</div>
        <div><span className="font-medium">Zip:</span> {form.zip}</div>
        <div><span className="font-medium">Card Number:</span> **** **** **** {form.cardNumber?.slice(-4)}</div>

      </div>

      {/* Comments */}
      <div className="space-y-2">
        <Label>Additional Comments</Label>
        <Textarea
          placeholder="Any final comments?"
          value={form.comments || ""}
          onChange={(e) =>
            setForm({ ...form, comments: e.target.value })
          }
        />
      </div>

      {/* Terms Checkbox */}
      <div className="flex items-start space-x-3">
        <Checkbox
          checked={agree}
          onCheckedChange={(checked: boolean) =>
            setAgree(checked)
          }
        />
        <Label className="text-sm leading-none">
          I agree to the Terms and Conditions
        </Label>
      </div>

    </div>
  )
}