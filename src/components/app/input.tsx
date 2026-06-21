import * as React from "react"
import { Search } from "lucide-react"

import { cn } from "@/lib/utils"

import { AppFormField } from "@/components/app/forms"

import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

type BaseFieldProps = {
  id?: string
  label?: React.ReactNode
  helperText?: React.ReactNode
  errorText?: React.ReactNode
  required?: boolean
  className?: string
  wrapperClassName?: string
  labelClassName?: string
  helperClassName?: string
  errorClassName?: string
  startIcon?: React.ReactNode
  endIcon?: React.ReactNode
}

export interface AppInputProps
  extends BaseFieldProps, Omit<React.ComponentPropsWithoutRef<typeof Input>, "id"> {}

export const AppInput = React.forwardRef<HTMLInputElement, AppInputProps>(
  (
    {
      id,
      label,
      helperText,
      errorText,
      required = false,
      className,
      wrapperClassName,
      labelClassName,
      helperClassName,
      errorClassName,
      startIcon,
      endIcon,
      ...props
    },
    ref
  ) => {
    const generatedId = React.useId()
    const inputId = id ?? generatedId
    const describedBy = [
      helperText ? `${inputId}-help` : null,
      errorText ? `${inputId}-error` : null,
    ]
      .filter(Boolean)
      .join(" ")

    return (
      <AppFormField
        id={inputId}
        label={label}
        helperText={helperText}
        errorText={errorText}
        required={required}
        className={wrapperClassName}
        labelClassName={labelClassName}
        helperClassName={helperClassName}
        errorClassName={errorClassName}
      >
        <div className={cn("relative", startIcon && "[&>input]:ps-9", endIcon && "[&>input]:pe-9")}>
          {startIcon ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 start-2 flex items-center text-muted-foreground"
            >
              {startIcon}
            </span>
          ) : null}
          <Input
            ref={ref}
            id={inputId}
            aria-invalid={Boolean(errorText)}
            aria-describedby={describedBy || undefined}
            aria-required={required || undefined}
            className={className}
            {...props}
          />
          {endIcon ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 end-2 flex items-center text-muted-foreground"
            >
              {endIcon}
            </span>
          ) : null}
        </div>
      </AppFormField>
    )
  }
)

AppInput.displayName = "AppInput"

export interface AppTextareaProps
  extends BaseFieldProps, Omit<React.ComponentPropsWithoutRef<typeof Textarea>, "id"> {}

export const AppTextarea = React.forwardRef<HTMLTextAreaElement, AppTextareaProps>(
  (
    {
      id,
      label,
      helperText,
      errorText,
      required = false,
      className,
      wrapperClassName,
      labelClassName,
      helperClassName,
      errorClassName,
      ...props
    },
    ref
  ) => {
    const generatedId = React.useId()
    const textareaId = id ?? generatedId
    const describedBy = [
      helperText ? `${textareaId}-help` : null,
      errorText ? `${textareaId}-error` : null,
    ]
      .filter(Boolean)
      .join(" ")

    return (
      <AppFormField
        id={textareaId}
        label={label}
        helperText={helperText}
        errorText={errorText}
        required={required}
        className={wrapperClassName}
        labelClassName={labelClassName}
        helperClassName={helperClassName}
        errorClassName={errorClassName}
      >
        <Textarea
          ref={ref}
          id={textareaId}
          aria-invalid={Boolean(errorText)}
          aria-describedby={describedBy || undefined}
          aria-required={required || undefined}
          className={className}
          {...props}
        />
      </AppFormField>
    )
  }
)

AppTextarea.displayName = "AppTextarea"

export interface AppSearchInputProps extends Omit<AppInputProps, "type"> {
  placeholder?: string
}

export function AppSearchInput({ placeholder = "Search", ...props }: AppSearchInputProps) {
  return (
    <AppInput
      type="search"
      placeholder={placeholder}
      startIcon={<Search className="size-4" />}
      {...props}
    />
  )
}
