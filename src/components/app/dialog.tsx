"use client"

import * as React from "react"
import { XIcon } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

import { AppButton } from "@/components/app/button"

export interface AppDialogProps extends React.ComponentProps<typeof DialogPrimitive.Root> {
  title?: React.ReactNode
  description?: React.ReactNode
  footer?: React.ReactNode
  children?: React.ReactNode
  contentClassName?: string
  showCloseButton?: boolean
}

export function AppDialog({
  title,
  description,
  footer,
  children,
  contentClassName,
  showCloseButton = true,
  ...props
}: AppDialogProps) {
  return (
    <DialogPrimitive.Root {...props}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/10 backdrop-blur-xs" />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 grid w-[90vw] max-w-[44rem] max-h-[calc(100dvh-2rem)] -translate-x-1/2 -translate-y-1/2 grid-rows-[auto_minmax(0,1fr)_auto] gap-4 overflow-hidden rounded-xl bg-background p-4 text-sm ring-1 ring-foreground/10 outline-none sm:w-full",
            contentClassName
          )}
        >
          {showCloseButton ? (
            <DialogPrimitive.Close asChild>
              <AppButton
                variant="ghost"
                size="icon-sm"
                className="absolute end-2 top-2"
                aria-label="Close dialog"
              >
                <XIcon className="size-4" />
              </AppButton>
            </DialogPrimitive.Close>
          ) : null}
          {title || description ? (
            <div className="space-y-1.5 pe-8">
              {title ? (
                <DialogPrimitive.Title className="text-base font-medium leading-none">
                  {title}
                </DialogPrimitive.Title>
              ) : null}
              {description ? (
                <DialogPrimitive.Description className="text-sm text-muted-foreground">
                  {description}
                </DialogPrimitive.Description>
              ) : null}
            </div>
          ) : null}
          <div className="min-h-0 overflow-y-auto pe-1">{children}</div>
          {footer ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">{footer}</div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export interface AppConfirmDialogProps extends Omit<
  AppDialogProps,
  "footer" | "children" | "title" | "description"
> {
  title: React.ReactNode
  description?: React.ReactNode
  confirmLabel?: React.ReactNode
  cancelLabel?: React.ReactNode
  confirmTone?: "default" | "destructive"
  loading?: boolean
  onConfirm: () => void | Promise<void>
  onCancel?: () => void
  children?: React.ReactNode
}

export function AppConfirmDialog({
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmTone = "default",
  loading = false,
  onConfirm,
  onCancel,
  children,
  ...props
}: AppConfirmDialogProps) {
  return (
    <AppDialog
      title={title}
      description={description}
      footer={
        <>
          <AppButton variant="outline" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </AppButton>
          <AppButton
            variant={confirmTone === "destructive" ? "destructive" : "default"}
            loading={loading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </AppButton>
        </>
      }
      {...props}
    >
      {children}
    </AppDialog>
  )
}
