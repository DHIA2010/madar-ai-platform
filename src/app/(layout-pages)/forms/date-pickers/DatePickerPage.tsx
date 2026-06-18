"use client"

import { DatePickerInput } from "./DatePickerInput"
import { DatePickerWithRange } from "./DatePickerWithRange"
import { DatePickerSimple } from "./SimpleDatePicker"
import { ComponentPreview } from "./ComponentPreview"

export default function DatePickerPage() {
  return (
    <div className="p-6 space-y-6">

      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Date Pickers
        </h1>
        <p className="text-muted-foreground">
          Interactive date picker components with live preview and source code.
        </p>
      </div>

      <div className="space-y-6">

        <ComponentPreview
          title="Simple Date Picker"
          description="Basic single date selection."
          code={`<DatePickerSimple />`}
        >
          <DatePickerSimple />
        </ComponentPreview>

        <ComponentPreview
          title="Date Range Picker"
          description="Select start and end date."
          code={`<DatePickerWithRange />`}
        >
          <DatePickerWithRange />
        </ComponentPreview>

        <ComponentPreview
          title="Input Date Picker"
          description="Date picker integrated with input."
          code={`<DatePickerInput />`}
        >
          <DatePickerInput />
        </ComponentPreview>

      </div>
    </div>
  )
}