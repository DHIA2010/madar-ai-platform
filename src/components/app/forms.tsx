import * as React from "react"

import { cn } from "@/lib/utils"

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"

export type AppFormProps = React.FormHTMLAttributes<HTMLFormElement>

export const AppForm = React.forwardRef<HTMLFormElement, AppFormProps>(
  ({ className, ...props }, ref) => (
    <form ref={ref} className={cn("space-y-6", className)} {...props} />
  )
)

AppForm.displayName = "AppForm"

export interface AppFormFieldProps extends React.HTMLAttributes<HTMLDivElement> {
  id?: string
  label?: React.ReactNode
  helperText?: React.ReactNode
  errorText?: React.ReactNode
  required?: boolean
  orientation?: "vertical" | "horizontal" | "responsive"
  labelClassName?: string
  helperClassName?: string
  errorClassName?: string
  children: React.ReactNode
}

export function AppFormField({
  id,
  label,
  helperText,
  errorText,
  required = false,
  orientation = "vertical",
  className,
  labelClassName,
  helperClassName,
  errorClassName,
  children,
  ...props
}: AppFormFieldProps) {
  const isInvalid = Boolean(errorText)

  return (
    <Field orientation={orientation} data-invalid={isInvalid} className={className} {...props}>
      <FieldContent>
        {label ? (
          <FieldLabel htmlFor={id} className={labelClassName}>
            {label}
            {required ? <span aria-hidden="true">*</span> : null}
          </FieldLabel>
        ) : null}
        {children}
        {helperText ? (
          <FieldDescription className={helperClassName}>{helperText}</FieldDescription>
        ) : null}
        {errorText ? <FieldError className={errorClassName}>{errorText}</FieldError> : null}
      </FieldContent>
    </Field>
  )
}

export interface AppFormSectionProps extends Omit<
  React.HTMLAttributes<HTMLFieldSetElement>,
  "title"
> {
  title?: React.ReactNode
  description?: React.ReactNode
}

export function AppFormSection({
  title,
  description,
  className,
  children,
  ...props
}: AppFormSectionProps) {
  return (
    <FieldSet className={cn("space-y-4", className)} {...props}>
      {title ? <FieldLegend>{title}</FieldLegend> : null}
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      <FieldGroup>{children}</FieldGroup>
    </FieldSet>
  )
}
