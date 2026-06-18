// app/components/steps/Step2.tsx
"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function Step2({ form, setForm }: any) {
  return (
    <div className="space-y-6 bg-background rounded-2xl shadow border p-8">

      {/* Title */}
      <div>
        <h2 className="text-lg font-semibold">
          Additional Info
        </h2>
        <p className="text-sm text-muted-foreground">
          Please fill in your additional information below.
        </p>
      </div>

      {/* Grid Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Address */}
        <div className="space-y-2">
          <Label>Address</Label>
          <Input
            placeholder="Address"
            value={form.address}
            onChange={(e) =>
              setForm({ ...form, address: e.target.value })
            }
          />
        </div>

        {/* City */}
        <div className="space-y-2">
          <Label>City</Label>
          <Input
            placeholder="City"
            value={form.city}
            onChange={(e) =>
              setForm({ ...form, city: e.target.value })
            }
          />
        </div>

        {/* State */}
        <div className="space-y-2">
          <Label>State</Label>
          <Input
            placeholder="State"
            value={form.state}
            onChange={(e) =>
              setForm({ ...form, state: e.target.value })
            }
          />
        </div>

        {/* Zip Code */}
        <div className="space-y-2">
          <Label>Zip Code</Label>
          <Input
            placeholder="Zip Code"
            value={form.zip}
            onChange={(e) =>
              setForm({ ...form, zip: e.target.value })
            }
          />
        </div>

        {/* Occupation */}
        <div className="space-y-2">
          <Label>Occupation</Label>
          <Input
            placeholder="Occupation"
            value={form.occupation}
            onChange={(e) =>
              setForm({ ...form, occupation: e.target.value })
            }
          />
        </div>

        {/* Company */}
        <div className="space-y-2">
          <Label>Company</Label>
          <Input
            placeholder="Company"
            value={form.company}
            onChange={(e) =>
              setForm({ ...form, company: e.target.value })
            }
          />
        </div>

      </div>
    </div>
  )
}