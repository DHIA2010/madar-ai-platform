import * as React from "react"
import type { VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

import { Button, type buttonVariants } from "@/components/ui/button"

export interface AppButtonProps
  extends React.ComponentPropsWithoutRef<typeof Button>, VariantProps<typeof buttonVariants> {
  loading?: boolean
  icon?: React.ReactNode
  iconPosition?: "start" | "end"
  fullWidth?: boolean
}

export const AppButton = React.forwardRef<HTMLButtonElement, AppButtonProps>(
  (
    {
      className,
      loading = false,
      disabled,
      icon,
      iconPosition = "start",
      fullWidth = false,
      children,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading
    const buttonContent = (
      <>
        {loading ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : icon && iconPosition === "start" ? (
          <span aria-hidden="true" className="contents">
            {icon}
          </span>
        ) : null}
        <span>{children}</span>
        {!loading && icon && iconPosition === "end" ? (
          <span aria-hidden="true" className="contents">
            {icon}
          </span>
        ) : null}
      </>
    )

    if (props.asChild) {
      const child = React.Children.only(children) as React.ReactElement<{
        children?: React.ReactNode
        className?: string
      }>

      return (
        <Button
          ref={ref}
          disabled={isDisabled}
          className={cn(fullWidth && "w-full", className)}
          {...props}
        >
          {React.cloneElement(child, {
            children: buttonContent,
          })}
        </Button>
      )
    }

    return (
      <Button
        ref={ref}
        disabled={isDisabled}
        className={cn(fullWidth && "w-full", className)}
        {...props}
      >
        {buttonContent}
      </Button>
    )
  }
)

AppButton.displayName = "AppButton"
