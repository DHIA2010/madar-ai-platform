import * as React from "react"

import { cn } from "@/lib/utils"

import {
  AppInput,
  type AppInputProps,
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from "@/components/app"

// Height/padding/radius/border/focus tokens come directly from the supplied design spec, not
// the app's default input theme -- these wrap AppInput/AppSelect (never the raw shadcn
// primitives, per the app's import-boundary rule for feature code) with those tokens applied
// once, reused across every field in the campaign-link dialog.
const FIELD_CLASSNAME =
  "h-11 w-full rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-0 text-sm text-[#172033] " +
  "placeholder:text-[#94A3B8] focus-visible:border-[#4F46E5] focus-visible:ring-[3px] " +
  "focus-visible:ring-[#4F46E5]/15"

// The shared FieldLabel is `width: fit-content`, and a shrink-to-fit box containing pure-Latin
// text (e.g. "utm_source") inside an RTL container is subject to a well-known CSS bidi quirk --
// browsers can anchor it to the content's own paragraph direction instead of the container's,
// which is why the English-named UTM fields' labels were landing on the left while the
// Arabic-labeled fields landed correctly on the right. A plain `w-full` block label sidesteps
// that entirely: with no shrink-to-fit sizing, positioning is just ordinary block text-align.
function FieldLabelBlock({
  htmlFor,
  required,
  children,
}: {
  htmlFor: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label htmlFor={htmlFor} className="block w-full text-sm font-medium text-[#172033]">
      {children}
      {required ? <span aria-hidden="true"> *</span> : null}
    </label>
  )
}

export const DialogInput = React.forwardRef<HTMLInputElement, AppInputProps>(
  (
    {
      className,
      wrapperClassName,
      helperClassName,
      startIcon,
      endIcon,
      id,
      label,
      required,
      ...props
    },
    ref
  ) => {
    const generatedId = React.useId()
    const inputId = id ?? generatedId

    return (
      <div className={cn("space-y-1.5", wrapperClassName)}>
        {label ? (
          <FieldLabelBlock htmlFor={inputId} required={required}>
            {label}
          </FieldLabelBlock>
        ) : null}
        <AppInput
          ref={ref}
          id={inputId}
          required={required}
          helperClassName={cn("text-xs text-[#64748B]", helperClassName)}
          className={cn(FIELD_CLASSNAME, startIcon && "ps-10", endIcon && "pe-10", className)}
          startIcon={startIcon}
          endIcon={endIcon}
          {...props}
        />
      </div>
    )
  }
)
DialogInput.displayName = "DialogInput"

interface DialogSelectOption {
  value: string
  label: string
}

interface DialogSelectProps {
  id: string
  label: string
  required?: boolean
  placeholder?: string
  value: string
  onValueChange: (value: string) => void
  options: DialogSelectOption[]
}

export function DialogSelect({
  id,
  label,
  required,
  placeholder,
  value,
  onValueChange,
  options,
}: DialogSelectProps) {
  return (
    <div className="space-y-1.5">
      <FieldLabelBlock htmlFor={id} required={required}>
        {label}
      </FieldLabelBlock>
      <AppSelect value={value} onValueChange={onValueChange}>
        <AppSelectTrigger id={id} className={FIELD_CLASSNAME}>
          <AppSelectValue placeholder={placeholder} />
        </AppSelectTrigger>
        <AppSelectContent>
          {options.map((option) => (
            <AppSelectItem key={option.value} value={option.value}>
              {option.label}
            </AppSelectItem>
          ))}
        </AppSelectContent>
      </AppSelect>
    </div>
  )
}
