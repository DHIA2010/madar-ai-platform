"use client"

import * as React from "react"
import * as SheetPrimitive from "@radix-ui/react-dialog"
import { XIcon } from "lucide-react"

import { cn } from "@/lib/utils"

import { AppButton } from "@/components/app/button"

type AppDrawerSide = "top" | "bottom" | "left" | "right"

const drawerVariants: Record<AppDrawerSide, string> = {
  top: "inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
  bottom:
    "inset-x-0 bottom-0 border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
  left: "inset-y-0 start-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-start data-[state=open]:slide-in-from-start sm:max-w-sm",
  right:
    "inset-y-0 end-0 h-full w-3/4 border-l data-[state=closed]:slide-out-to-end data-[state=open]:slide-in-from-end sm:max-w-sm",
}

export interface AppDrawerProps extends React.ComponentProps<typeof SheetPrimitive.Root> {
  title?: React.ReactNode
  description?: React.ReactNode
  footer?: React.ReactNode
  children?: React.ReactNode
  side?: AppDrawerSide
  contentClassName?: string
  showCloseButton?: boolean
}

export function AppDrawer({
  title,
  description,
  footer,
  children,
  side = "right",
  contentClassName,
  showCloseButton = true,
  ...props
}: AppDrawerProps) {
  return (
    <SheetPrimitive.Root {...props}>
      <SheetPrimitive.Portal>
        <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <SheetPrimitive.Content
          className={cn(
            "fixed z-50 gap-4 bg-background p-6 shadow-lg transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500 data-[state=open]:animate-in data-[state=closed]:animate-out",
            drawerVariants[side],
            contentClassName
          )}
        >
          {showCloseButton ? (
            <SheetPrimitive.Close asChild>
              <AppButton
                variant="ghost"
                size="icon-sm"
                className="absolute end-4 top-4"
                aria-label="Close drawer"
              >
                <XIcon className="size-4" />
              </AppButton>
            </SheetPrimitive.Close>
          ) : null}
          {title || description ? (
            <div className="space-y-1.5 pe-8 text-start">
              {title ? <div className="text-lg font-semibold text-foreground">{title}</div> : null}
              {description ? (
                <div className="text-sm text-muted-foreground">{description}</div>
              ) : null}
            </div>
          ) : null}
          <div className="min-h-0 flex-1">{children}</div>
          {footer ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">{footer}</div>
          ) : null}
        </SheetPrimitive.Content>
      </SheetPrimitive.Portal>
    </SheetPrimitive.Root>
  )
}
